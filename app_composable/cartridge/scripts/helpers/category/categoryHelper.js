'use strict';
const Site = require('dw/system/Site').getCurrent();
const CatalogMgr = require('dw/catalog/CatalogMgr');

const sitenavFilterCategoryPropertiesBoolean = Site.getCustomPreferenceValue('categoryEndpointUseTopNavPropertiesForCategories');

const sitenavFilterCategoryPropertiesList = Site.getCustomPreferenceValue('categoryEndpointTopNavPropertiesForCategories');
const sitenavHardcodeFilterCategoryPropertiesList = ['id', 'name', 'categories', 'c_pageURL', 'c_pageURLBase', 'parentCategoryTree'];
const sitenavPropertiesToKeep = sitenavHardcodeFilterCategoryPropertiesList.concat(sitenavFilterCategoryPropertiesList);

const keepThesePropertiesForOfflineCategoryList = ['id', 'c_online'];

/**
 * @namespace CategoryHelper
 */

/**
 * Only returns attributes for a category if that attribute is defined in the categoryEndpointTopNavPropertiesForCategories site preference
 * @function deletePropertiesForOfflineCategory
 * @memberof CategoryHelper
 * @param {Category} category - the category to delete properties on
 * @returns the category for deleted properties
 */
function deletePropertiesForOfflineCategory(category) {
    if (!empty(keepThesePropertiesForOfflineCategoryList)) {
        //Delete almost everything if the category is offline
        for (let prop in category) {
            if (!keepThesePropertiesForOfflineCategoryList.includes(prop)) {
                delete category[prop];
            }
        }
    }
    return category;
}

/**
 * Only returns attributes for a category if that attribute is defined in the categoryEndpointTopNavPropertiesForCategories site preference
 * @function sitenavFilterCategoryProperties
 * @memberof CategoryHelper
 * @param {Category} category - the category to filter
 * @param {Array} propertiesToKeep - properties that we want to keep
 * @returns the filtered category
 */
function sitenavFilterCategoryProperties(category, propertiesToKeep) {
    if (sitenavFilterCategoryPropertiesBoolean && !empty(propertiesToKeep)) {
        //If the attribute is defined in the site preference, then we won't delete it
        //or if the attribute is menuGroup because we need that no matter what
        for (let prop in category) {
            if (!propertiesToKeep.includes(prop)) {
                delete category[prop];
            }
        }
    }
    return category;
}

/**
 * processes the sub category groups of the parent category
 * @function sitenavProcessSubCategories
 * @memberof CategoryHelper
 * @param {Category} category - the category to filter
 * @param {Category} parentCategoryId - id of the parrent category
 */
function sitenavProcessSubCategories(category, parentCategoryId) {
    let groups = [];
    if (!empty(category.categories) && category.categories.length > 0) {

        //only use the categories that have c_showInMenu=true
        category.categories = category.categories.toArray().filter(e => e.c_showInMenu);

        let groupIndexToInsert;

        for (let i = 0; i < category.categories.length; i++) {
            let subCategory = category.categories[i];

            //legacy url for sub categories
            let subCategoryFromSFCC = CatalogMgr.getCategory(subCategory.id);
            setCategoryPageURL(subCategoryFromSFCC, subCategory);

            //add categories to individual groups based on custom.menuGroup attribute
            let groupKey = subCategory.c_menuGroup || 'ungrouped';

            //filtering after using the c_menuGroup attribute because this sitenavFilterCategoryProperties function
            //deletes the c_menuGroup attribute

            sitenavFilterCategoryProperties(subCategory, sitenavPropertiesToKeep);

            //find out if the group exists. groupIndexToInsert == -1 means it does not exist
            groupIndexToInsert = groups.findIndex(function (e) { return e.id === groupKey });

            //If the group doesn't exist, then create the group and add a c_title if it is not ungrouped
            if (groupIndexToInsert == -1) {
                groups.push({ id: groupKey, c_title: null, categories: [] });
                groupIndexToInsert = groups.length - 1;
                if (groupKey !== 'ungrouped' && empty(groups[groupIndexToInsert].c_title)) {
                    let catalogCategory = CatalogMgr.getCategory(subCategory.id);
                    if (catalogCategory && catalogCategory.custom.menuGroup) {
                        groups[groupIndexToInsert].c_title = catalogCategory.custom.menuGroup.getDisplayValue();
                    }
                }
            }
            groups[groupIndexToInsert].categories.push(subCategory);
        }

        //Adds all groups with their subcategories to the top level category JSON
        category.categories = groups;
    }
}

/**
 * Set the page url of the category
 * @function setCategoryPageURL
 * @memberof CategoryHelper
 * @param {Category} category - the category
 * @param {doc} doc - the api response doc
 */
function setCategoryPageURL(category, doc) {
    const contentHelpers = require('app_composable/cartridge/scripts/helpers/content/contentHelpers.js');

    let pageUrl = '/';

    if (category.pageURL) {
        pageUrl = pageUrl + category.pageURL;
    } else {
        let searchUrl = contentHelpers.getSGUrl(category);

        pageUrl = searchUrl.includes(Site.ID) ? searchUrl.split(Site.ID)[1]: searchUrl;
    }
    doc.c_pageURL = pageUrl;
    doc.c_pageURLBase = setPageURLBase(pageUrl);
}

/**
 * Processes a category and its nested categories, including parent categories.
 * @function deleteForOfflineCategories
 * @memberof CategoryHelper
 * @param {Object} categorySFCC - The category for SFCC to be processed
 * @param {Object} categoryObject - The category object that will be returned in response
 * @returns {boolean} - If the category is offline or online.
 */
function deleteForOfflineCategories(categorySFCC, categoryObject) {
    if (categorySFCC.online) {
        categoryObject.c_online = true;
        return true;
    } else {
        categoryObject.c_online = false;
        deletePropertiesForOfflineCategory(categoryObject);
        return false;
    }
}

/**
 * Processes a category and its nested categories, including parent categories.
 * @function globalProcessCategory
 * @memberof CategoryHelper
 * @param {Object} category - The category to be processed.
 * @returns {Object} - The processed category.
 */
function globalProcessCategory(category) {
    if (!category) return null;

    // Generate URL for current category
    let catUrl = dw.web.URLUtils.url('Search-Show', 'cgid', category.id).toString();
    let cleanedCatUrl = catUrl.includes(Site.ID) ? catUrl.split(Site.ID)[1] : catUrl;
    category.c_pageURL = cleanedCatUrl[0] && cleanedCatUrl[1] === '/' ? cleanedCatUrl.substring(1) : cleanedCatUrl;
    category.c_pageURLBase = setPageURLBase(category.c_pageURL);

    // Process parent categories
    if (category.parentCategoryTree) {
        category.parentCategoryTree = category.parentCategoryTree.toArray().filter(parent => parent.name);
        category.parentCategoryTree = category.parentCategoryTree.toArray().map(parent => {
            let parentUrl = dw.web.URLUtils.url('Search-Show', 'cgid', parent.id).toString();
            let cleanedParentUrl = parentUrl.includes(Site.ID) ? parentUrl.split(Site.ID)[1] : parentUrl;
            parent.c_pageURL = cleanedParentUrl[0] && cleanedParentUrl[1] === '/' ? cleanedParentUrl.substring(1) : cleanedParentUrl;
            parent.c_pageURLBase = setPageURLBase(parent.c_pageURL);
            return parent;
        });
    }

    // Recursively process nested categories
    if (category.categories) {
        category.categories = category.categories.toArray().map(globalProcessCategory);
    }

    return category;
}

/**
 * Processes an array of categories by applying globalProcessCategory to each one.
 * @function globalProcessCategories
 * @memberof CategoryHelper
 * @param {ArrayList} categories - Array of categories to be processed.
 * @returns {Array} - Array of processed categories.
 */
function globalProcessCategories(categories) {
    return categories.toArray().filter(e => e.name['en-US'] || e.name['en-CA']).map(globalProcessCategory);
}

/**
 * Add page URL to top-level categories.
 * @function globalProcessParentCategories
 * @memberof CategoryHelper
 * @param {ArrayList} parentCategories - Array of top-level categories
 * @returns {Array} - Array of processed top-level categories.
 */
function globalProcessParentCategories(parentCategories) {  
    return parentCategories.toArray().filter(e => e.name).map(parentCat => {
        let catalogCategory = CatalogMgr.getCategory(parentCat.id);
        if (!empty(catalogCategory)) {

            if (catalogCategory.pageURL) {
                parentCat.c_pageURL = catalogCategory.pageURL[0] === '/' ? catalogCategory.pageURL : '/' + catalogCategory.pageURL;
                parentCat.c_pageURLBase = setPageURLBase(parentCat.c_pageURL);
            } else {
                setCategoryPageURL(catalogCategory, parentCat);
            }

            parentCat.c_displayVisualNavigation = (!empty(catalogCategory.custom.displayVisualNavigation) && catalogCategory.custom.displayVisualNavigation);  
        } 
        return parentCat;
    });
}

/**
 * Strips locale segments (e.g. /en/, /fr/, /en-US/) from a page URL using the
 * site's allowed locales, returning a locale-neutral base URL.
 * @function setPageURLBase
 * @memberof CategoryHelper
 * @param {string} pageURL - The raw page URL that may contain a locale prefix
 * @returns {string} - The page URL with any locale segment removed
 */
function setPageURLBase(pageURL) {
    if(empty(pageURL)){
        return pageURL;
    }
    let pageUrlBase = pageURL;
    const allowedLocales = Site.getAllowedLocales();
    const localeSet = {};

    for (let i = 0; i < allowedLocales.size(); i++) {
        let locale = allowedLocales[i];
        if (locale === 'default') {
            continue;
        }

        let langCode = locale.split('_')[0];
        if (langCode) {
            localeSet[langCode] = true;
        }
    }

    const localePatterns = Object.keys(localeSet);
    if (localePatterns.length > 0) {
        const pattern = '\\/(' + localePatterns.join('|') + ')\\/';
        const regex = new RegExp(pattern, 'gi');
        pageUrlBase = pageUrlBase.replace(regex, '/');
    }

    return pageUrlBase;
}

module.exports = {
    deletePropertiesForOfflineCategory,
    sitenavFilterCategoryProperties,
    sitenavProcessSubCategories,
    setCategoryPageURL,
    setPageURLBase,
    deleteForOfflineCategories,
    globalProcessCategories,
    globalProcessParentCategories
}
