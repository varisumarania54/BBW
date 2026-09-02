'use strict'
importPackage(dw.system);
const CatalogMgr = require('dw/catalog/CatalogMgr');
const ContentMgr = require('dw/content/ContentMgr');
const attributesHelper = require('app_composable/cartridge/scripts/helpers/objects/attributes.js');
const FormatData = require('app_composable/cartridge/scripts/content/designSystem/FormatFulfillmentData.js').FormatData;

// const productHelpers = require('*/cartridge/scripts/helpers/product/productHelpers.js');
// const slotHelpers = require('*/cartridge/scripts/helpers/slot/slotHelpers.js');

// used to build models for content Assets
function buildContentAssetModel(assetId) {
    const contentAsset = ContentMgr.getContent(assetId);
    if (!contentAsset) return null;

    const contentModel = {
        id: contentAsset.ID,
        _type: 'content_asset',
        online: { default: contentAsset.online },
        searchable: { default: contentAsset.searchable },
        template: contentAsset.template,
    };

    // Add fulfillment module data if it is a fulfillment asset
    if (contentAsset.custom.fulfillmentCutoffHeading ||
      contentAsset.custom.fulfillmentCutoffStandard ||
      contentAsset.custom.fulfillmentCutoffExpedited ||
      contentAsset.custom.fulfillmentCutoffOvernight ||
      contentAsset.custom.fulfillmentCutoffPickUpInStore ||
      contentAsset.custom.fulfillmentCutoffInstaCart){
      let fulfillmentData = FormatData(contentAsset);
      if (!empty(fulfillmentData)) contentModel.c_fulfillmentData = fulfillmentData;
    }

    // Define fields to be included in the model
    const fields = {
        description: 'description',
        name: 'name',
        pageDescription: 'page_description',
        pageKeywords: 'page_keywords',
        pageTitle: 'page_title',
        pageURL: 'page_url',
        siteMapChangeFrequency: 'site_map_change_frequency',
        siteMapIncluded: 'site_map_included',
        siteMapPriority: 'site_map_priority',
    };

    // Add fields to the contentModel if they are not empty
    Object.keys(fields).forEach(field => {
        if (!empty(contentAsset[field])) {
        contentModel[fields[field]] = { default: contentAsset[field] };
        }
    });

    // Process custom attributes
    Object.entries(contentAsset.custom).forEach(([key, value]) => {
        contentModel[`c_${key}`] = attributesHelper.convertAttributeToJSON(value);
    });

    //Present the category URL if the custom attriute product categroy is set
    if (contentModel.c_productCategory) {
      contentModel.c_productCategoryUrl = dw.web.URLUtils.url('Search-Show', 'cgid', contentModel.c_productCategory).toString();
    }

    return contentModel;
}

//grab the category url
function getCategoryUrl(topLevelCategory, subCategory) {
  var url = '/' + topLevelCategory.ID + '/' + subCategory.ID;
  return url;
}

// create categrory URL
function getSGUrl(category) {
	var url;
	if (('alternativeUrl' in category.custom) && !empty(category.custom.alternativeUrl)) {
		url = category.custom.alternativeUrl.toString();
	} else {
    url = dw.web.URLUtils.url('Search-Show', 'cgid', category.getID()).toString();
  }
	return url;
}


// Get the top level category for a given category
function getNavigationTopLevelCategory(category) {
  var cat = category;
  while (!empty(cat) && !empty(cat.parent)) {
    if (cat.parent.root) {
      break;
    } else {
      cat = cat.parent;
    }
  }
  return cat
}

// Check if a category has already been added to the slot categories
function checkForDuplicateCategory(slotCategoryIdsOnly, currentCategory) {
  if (slotCategoryIdsOnly.length === 0) {
    return true;
  }
  for (var id in slotCategoryIdsOnly) {
    if (currentCategory.ID === slotCategoryIdsOnly[id]) {
      return false;
    }
  }
  return true;
}

// Build the visual navigation tiles
function buildVisNavTiles(slotCategoryIds, context) {
  var categoryInfoArray = [];
  var topLevelCategory = getNavigationTopLevelCategory(CatalogMgr.getCategory(context));
  var visNavSubcategories = topLevelCategory.subCategories;
  var visualNavigationDefaultImage = dw.system.Site.getCurrent().getCustomPreferenceValue('VisualNavigationDefaultImage') ? dw.system.Site.getCurrent().getCustomPreferenceValue('VisualNavigationDefaultImage').getURL().toString() : {errorMsg: 'No default image configured for visual navigation'};

  if (!slotCategoryIds) {
      slotCategoryIds = [];
  }

  var slotCategoryIdsOnly = slotCategoryIds;

  for (var subCat in visNavSubcategories) {
      if (visNavSubcategories[subCat].custom.showInMenu && visNavSubcategories[subCat].online && checkForDuplicateCategory(slotCategoryIdsOnly, visNavSubcategories[subCat])) {
          slotCategoryIds.push(visNavSubcategories[subCat]);
      }
  }

  for (var categoryId in slotCategoryIds) {

    var categoryInfo = {};
    var currentTile;

    if (!slotCategoryIds[categoryId].parent) {

      currentTile = CatalogMgr.getCategory(slotCategoryIds[categoryId]);

    } else {

      currentTile = slotCategoryIds[categoryId];

    }
    if (!currentTile) {
      categoryInfo.errorMsg = 'The provided category ID "' + slotCategoryIds[categoryId] + '" does not match any existing categories';
    } else {
      categoryInfo.id = currentTile.ID;
      categoryInfo.name = currentTile.custom.visualNavigationDisplayName ? currentTile.custom.visualNavigationDisplayName : currentTile.displayName;
      categoryInfo.image = currentTile.custom.visualNavigationCategoryImage && currentTile.custom.visualNavigationCategoryImage.absURL   ? currentTile.custom.visualNavigationCategoryImage.absURL.toString()  : visualNavigationDefaultImage;
      categoryInfo.url = getCategoryUrl(topLevelCategory, currentTile);
      categoryInfo.sgUrl = getSGUrl(currentTile).toString();
    }

    categoryInfoArray.push(categoryInfo);
  }
  return categoryInfoArray;
}

  // get the active campaign assignment
  function getActiveCampaignAssignment(slotConfig) {
    if (slotConfig &&
        slotConfig.assignment_information &&
        slotConfig.assignment_information.active_campaign_assignments &&
        slotConfig.assignment_information.active_campaign_assignments.length) {

        return slotConfig.assignment_information.active_campaign_assignments[0];

    } else {
        return null;
    }
  }

  // get the content asset of the current slot
  function getContentAssets(slotConfig, libraryId, token) {
    if (!slotConfig || !slotConfig.slot_content || !slotConfig.slot_content.content_asset_ids ) {
      return [];
    }
    // call ContentMgr script to grab the content asset info
    let contentAssets = slotConfig.slot_content.content_asset_ids.map(assetId => {

      let contentModel = buildContentAssetModel(assetId);

      return contentModel;

    });
    // remove empty content assets from contentAssets
    contentAssets = contentAssets.filter(n => n);
    return contentAssets;
  }



module.exports = {
    getSGUrl,
    getCategoryUrl,
    getNavigationTopLevelCategory,
    buildVisNavTiles,
    getActiveCampaignAssignment,
    buildContentAssetModel,
    getContentAssets
}
