'use strict'
/**
 * @module storeSearch.js
 * @namespace storeSearch
 */
const Status = require('dw/system/Status');
const storeHelper = require("app_composable/cartridge/scripts/helpers/store/storeHelpers.js");
const cacheTTLManager = require('app_composable/cartridge/scripts/helpers/util/cacheTTLManager.js');

 /**
 * @function modifyGETResponse
 * @memberof storeSearch
 * Modifies the store Search GET response
 * 
 * @param {Object} doc - store Search response document.
 * @returns {dw.system.Status} Hook execution status.
 */
exports.modifyGETResponse = function(doc) {
    const requestParams = request.httpParameterMap;
    const c_bopis = requestParams.c_bopis ? requestParams.c_bopis.value : '';
    const c_storeType = requestParams.c_storeType ? requestParams.c_storeType.value : '';
    const storeInventoryIds = [];

    // if bopis is on then run bopis logic
    if (c_bopis && c_bopis === 'true') {
        storeHelper.handleBOPIS(doc, requestParams.c_productId, storeInventoryIds);
    } else {
        //Only cache the API as a whole if it is not BOPIS because the BOPIS version will use
        //a custom cache to improve performance instead of this way of caching.
        cacheTTLManager.setResponseTTL();
    }

    // if there is a store type sent in the request then filter stores that don't have that type
    if (c_storeType) {
        storeHelper.filterByStoreType(doc, c_storeType);
    }
    

    return new Status(Status.OK);
};