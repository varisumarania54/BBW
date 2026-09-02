'use strict'
const Site = require('dw/system/Site').getCurrent();
const productHelper = require('app_composable/cartridge/scripts/helpers/objects/product');
const { isBopisStoreAvailable } = require('app_composable/cartridge/scripts/helpers/global/BopisOrderLimits');
const ForceSoldOutHelper = require('app_composable/cartridge/scripts/helpers/global/ForceSoldOutHelper.js');
const processingLimit = Site.getCustomPreferenceValue('searchLimitBEMaxProcessingCount');

/**
 * These functions are used for modifying product search data.
 * @namespace ProductSearchHelpers
 */

/**
 * Takes the response from product search api and refines the hits value to only show products based on online attribute, searchable if unavailable, web and store inventory availability, forced sold out, and available for instore pickup.
 *
 * @function refineOnlyAvailable
 * @param {object} doc - response object from product search api.
 * @return {object} doc - original response object with modified 'hits' key values.
 * @memberof ProductSearchHelpers
 */
function refineOnlyAvailable(doc) {
    const ProductMgr = require('dw/catalog/ProductMgr');

    const storeId = !empty(request.httpParameterMap.c_storeId) ? request.httpParameterMap.c_storeId.stringValue : '';
    const resultOffsetStart = !empty(doc.start) ? doc.start : 0;
    let lastProductIndex = 0;
    let productsToShow = new dw.util.ArrayList();
    const isStoreAvailable = !empty(storeId) ? isBopisStoreAvailable(storeId) : false;

    doc.hits.toArray().every((product, i) => {
        // In the event that we hit the processingLimit before processing all of the product hits, break the every() loop and proceed.
        if (productsToShow.length == processingLimit) {
            return false;
        } else {
            // processingLimit has NOT been hit, continue processing product hits.
            // Full product needed to check product attributes and get inventory.
            let fullProduct = ProductMgr.getProduct(product.productId);

            if (fullProduct && fullProduct.searchableIfUnavailableFlag) {
                productsToShow.push(product);
            } else if (!ForceSoldOutHelper.isMarkedAsSoldOutProduct(fullProduct)) {
                if (productHelper.hasSFCCInventory(fullProduct)) {
                    // Product has web inventory, searchable, and not forced out of stock. Show it.
                    productsToShow.push(product);
                } else if (isStoreAvailable && storeId && productHelper.isProductAvailableInStore(fullProduct, storeId)) {
                    // Product has store inventory, searchable, and available for in store pickup. Show it.
                    productsToShow.push(product);
                }
            }
            // Set lastProductIndex to current product index for use below in setting correct offset.
            lastProductIndex = i
        }
        // Returns true to continue the every() loop.
        return true;
    })
    // Finished processing required products, set offset and product hits then send back.
    // doc.start = Offset and is overwritten due to searching all products orderable or not, so we need to acknowledge how many products we went through and what index we stopped at when processingLimit has been hit.
    doc.start = resultOffsetStart + (lastProductIndex + 1);
    doc.hits = productsToShow;
    return doc;
}

/**
 * Refines product search hits based on forced sold out status.
 *
 * @function refineAvailable
 * @param {object} doc - Response object from product search api.
 * @return {object} doc - Original response object with modified 'hits' key values.
 * @memberof ProductSearchHelpers
 */

function refineAvailable(doc) {
    const ilids = getRefinementIlids();
    const storeId = ilids.length ? ilids[0].padStart(5, '0').padStart(8, 'BBW') : null;
    const isStoreAvailable = storeId ? isBopisStoreAvailable(storeId) : false;
    
    let hits = new dw.util.ArrayList();
    let hitsArray = doc.hits.toArray();
    let offset = doc.start || 0;

    for (let i = 0; i < hitsArray.length; i++) {
        if (hits.length == processingLimit) break;
        offset = offset + 1;

        let hit = hitsArray[i];
        let product = productHelper.getProductAttributesUsingCache(hit.productId);
        let productAvailability = productHelper.getProductWebAvailabilityUsingCache(hit.productId);


        if (!product.searchableIfUnavailableFlag) {          
            if (product.forceSoldOut.isForceSoldOut || (!productAvailability.available && (!isStoreAvailable || !product.custom.availableForInStorePickup))) { 
                continue;                         
            }
        }
        
        hits.push(hit);
    }

    doc.start = offset;
    doc.hits = hits;
    return doc;
}

/**
 * Extracts inventory list IDs (ilids) from HTTP request parameters.
 * Searches through all parameter names for values containing 'ilids=' and parses them.
 *
 * @function getRefinementIlids
 * @return {Array<string>} Array of inventory list IDs extracted from refinement parameters.
 * @memberof ProductSearchHelpers
 */
function getRefinementIlids() {
    let parameters = request.getHttpParameterMap();
    let parameterNames = parameters.getParameterNames().toArray();
    let ilids = [];
    let webInventoryListId = Site.getCustomPreferenceValue('WebInventoryListId');
    for (let i = 0; i < parameterNames.length; i++) {
        let value = parameters.get(parameterNames[i]).getStringValue();
        if (value && value.indexOf('ilids=') > -1) {
            ilids = value.slice(6).split(',').filter(ilid => ilid !== webInventoryListId);
            break;
        }
    }
    return ilids;

}

module.exports = {
    refineOnlyAvailable,
    refineAvailable,
    getRefinementIlids
}