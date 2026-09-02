/**
 * @module productSearch.js
 * @namespace ProductSearch
 */
'use strict';

const Status = require('dw/system/Status');
const Site = require('dw/system/Site').getCurrent();
const enableShopTheStore = Site.getCustomPreferenceValue('enableShopTheStore');
const enableConstructor = Site.getCustomPreferenceValue('ConstructrEnabled');
const maxInventoryListRefinements = Site.getCustomPreferenceValue('maxInventoryListRefinements');

const { getRefinementIlids, 
        refineAvailable, 
        refineOnlyAvailable } = require('app_composable/cartridge/scripts/helpers/productSearch/productSearchHelpers');
const { setResponseTTL } = require('app_composable/cartridge/scripts/helpers/util/cacheTTLManager');
const { logHandler } = require('app_composable/cartridge/scripts/helpers/util/logHandler');

/** 
 * BeforeGET produtSearch hook functionality to validate maxInventoryListRefinements
 * @function beforeGET 
 * @memberof ProductSearch
 * @return {void | dw.system.Status} - Status if validation error or exception
 */
exports.beforeGET = function () {
    try {
        let ilids = getRefinementIlids();
        
        if (ilids.length > maxInventoryListRefinements) {
            return new Status(Status.ERROR, '400', `Too many ilids refinements: ${ilids.length}. Maximum allowed: ${maxInventoryListRefinements}`);
        }
    } catch (e) {
        logHandler.logger.error(e, 'Hooks', 'product_search');
        return new Status(Status.ERROR);
    }
}

/**
 * modifyGETResponse produtSearch hook functionality to Takes the response from product search api
 * and refines the hits value to show products
 * @function modifyGETResponse
 * @param {object} doc - response object from product search api.
 * @return {object} doc - original response object with modified Refines product.
 * @memberof ProductSearch
 */
exports.modifyGETResponse = function (doc) {
    try {
        let refinements = doc.refinements.toArray();
        let isCategory = refinements.some(refinement => refinement.attributeId === 'cgid');
        let isSearch = refinements.some(refinement => refinement.attributeId === 'q');
        let hasStoreIdCustomParam = !empty(request.httpParameterMap.c_storeId) && !empty(request.httpParameterMap.c_storeId.stringValue);
        
        if (!hasStoreIdCustomParam && enableShopTheStore && (isCategory || !enableConstructor && isSearch)) {
            // Filters forced sold out products from product search hits.
            refineAvailable(doc);
        } else {
            // Refines product search hits based on availability, searchableIfUnavailableFlag, and ForceSoldOutHelper.
            refineOnlyAvailable(doc);
        }

        // Cache response and return OK status.
        setResponseTTL();
        return new Status(Status.OK);

    } catch (e) {
        logHandler.logger.error(e, 'Hooks', 'product_search');
        return new Status(Status.ERROR);
    }
}
