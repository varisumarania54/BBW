/**
 * @module categories.js
 * @namespace categories
 */ 
'use strict';

const Site = require('dw/system/Site').getCurrent();

const CatalogMgr = require('dw/catalog/CatalogMgr');
const Status = require('dw/system/Status');

const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;
const errorHandler = require('app_composable/cartridge/scripts/helpers/util/errorHandler.js').errorHandler;
const CategoryHelper = require('app_composable/cartridge/scripts/helpers/category/categoryHelper.js');


const locale = Site.getDefaultLocale().toString();
const localeMap = {
    "en_US": "en-US",
    "en_CA": "en-CA"
};


const sitenavFilterCategoryPropertiesList = Site.getCustomPreferenceValue('categoryEndpointTopNavPropertiesForCategories');
const sitenavHardcodeFilterCategoryPropertiesList = ['id', 'name', 'categories', 'c_pageURL', 'parentCategoryTree'];
const sitenavPropertiesToKeep = sitenavHardcodeFilterCategoryPropertiesList.concat(sitenavFilterCategoryPropertiesList);

const visualNavigationFilterCategoryPropertiesList = ['id', 'name', 'categories', 'c_pageURL', 'c_displayVisualNavigation', 'c_visualNavigationCategoryImage', 'c_visualNavigationDisplayName'];


/**
 * @function modifyGETResponse
 * @memberof categories
 * Modifies the Shopper Products GET categories response before it is returned.
 * Supports top navigation and visual navigation payload shaping, applies offline
 * category filtering, enriches category URLs and links, and normalizes category names.
 *
 * @param {dw.catalog.Category} categories - The SFCC category object resolved for the request context.
 * @param {Object} doc - The response document to mutate and return to Shopper APIs.
 * @returns {dw.system.Status} Hook execution status.
 */
exports.modifyGETResponse = function (categories, doc) {
    try {
        //Need this parameter in the request to get the top nav data
        let sitenav = request.httpParameters.get("c_sitenav");
        let visualNavigation = request.httpParameters.get("c_visualNavigation");
        let visualNavigationBool = !empty(visualNavigation) && visualNavigation[0] === 'true';

        let cat;

        if (doc.id) {
            if ((categories && categories.ID) == doc.id) {
                cat = categories;
            } else {
                cat = CatalogMgr.getCategory(doc.id);
            }
        }

        if (cat) {
            if (!CategoryHelper.deleteForOfflineCategories(cat, doc)) {
                return new Status(Status.OK);
            };
        } 

        if (!empty(sitenav) && sitenav[0] === 'true' && visualNavigationBool) {

            throw new errorHandler.error('Category-04-001');
        } else if (!empty(sitenav) && sitenav[0] === 'true') {

            doc.categories = doc.categories.toArray().filter(category => category.c_showInMenu && (category.name['en-CA'] || category.name['en-US']));
            doc.c_pageURL = categories.pageURL;
            doc.c_pageURLBase = CategoryHelper.setPageURLBase(categories.pageURL); 
            // update doc
            for (let i = 0; i < doc.categories.length; i++) {
                if (doc.categories[i]) {
                    //Processing sub categories before filter category properties because we need all
                    //category properties to process the sub categories
                    CategoryHelper.sitenavProcessSubCategories(doc.categories[i], doc.categories[i].id);

                    //Need to be after process sub categories
                    CategoryHelper.sitenavFilterCategoryProperties(doc.categories[i], sitenavPropertiesToKeep);


                }
            }
        } else if (visualNavigationBool) {
            for (let i = 0; i < doc.categories.length; i++) {
                CategoryHelper.sitenavFilterCategoryProperties(doc.categories[i], visualNavigationFilterCategoryPropertiesList);
            }
        }

        if (doc.id) {
            let docUrl = dw.web.URLUtils.url('Search-Show', 'cgid', doc.id).toString();
            docUrl = docUrl.includes(Site.ID) ? docUrl.split(Site.ID)[1] : docUrl;
            doc.c_pageURL = docUrl;
            doc.c_pageURLBase = CategoryHelper.setPageURLBase(docUrl); 
            // add category links to the response
            if (cat && cat.onlineOutgoingCategoryLinks) {
                let links = []
                for (let i = 0; i < cat.onlineOutgoingCategoryLinks.length; i++) {
                    let linkedCategory = {
                        name : cat.onlineOutgoingCategoryLinks[i].targetCategory && cat.onlineOutgoingCategoryLinks[i].targetCategory.displayName ? cat.onlineOutgoingCategoryLinks[i].targetCategory.displayName : '',
                        ID : cat.onlineOutgoingCategoryLinks[i].targetCategory && cat.onlineOutgoingCategoryLinks[i].targetCategory.ID ? cat.onlineOutgoingCategoryLinks[i].targetCategory.ID : ''
                    }
                    links.push(linkedCategory);
                }
                doc.c_categoryLinks = links;
            }
        }

        //Setting the c_renderingTemplate on the top level category
        //Used on a category landing page to help front end render a category page
        if (categories.template) doc.c_renderingTemplate = categories.template;

        // Process urls
        doc.categories = CategoryHelper.globalProcessCategories(doc.categories);
        doc.parentCategoryTree = CategoryHelper.globalProcessParentCategories(doc.parentCategoryTree);

        // fallback if there is a missing name which there shouldn't we will set it to the ID
        // we can't remove the called category in modifyGetResponse
        const localeKey = localeMap[locale];
        if (localeKey && doc.name && !doc.name[localeKey]) {
            doc.name[localeKey] = doc.id;
        }

    } catch (e) {
        logHandler.logger.error(e, 'Hooks', 'category');
        return new Status(Status.ERROR);
    }

    return new Status(Status.OK);
};
