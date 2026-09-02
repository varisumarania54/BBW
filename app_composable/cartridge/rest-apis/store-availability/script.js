'use strict';
/**
 * Custom storeAvailability api 
 * @namespace StoreAvailabilityAPI
 */
const apiUtils = require("app_composable/cartridge/scripts/apiUtils.js");
const apiImplementation = require('app_composable/cartridge/scripts/apis/storeAvailability.js');
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;
const sitePrefHelper = require('app_composable/cartridge/scripts/helpers/util/sitePrefHelper');

/**
 * @function:This SCAPI CUSTOM API endpoint is used to the availability status of products for a specific store. 
 * @returns {Object} JSON with productId and respective products store availability status.
 * @memberof StoreAvailabilityAPI
 */

exports.getStoreAvailability = function () {   
    try {
        let enableStorePickup = sitePrefHelper.getSitePrefValue('enableStorePickUp');
        if (enableStorePickup) {
            const params = request.httpParameters;
            const storeId = params.c_storeId[0];
            const productIds = params.c_productIds[0];
            let responses = apiImplementation.storeAvailability(storeId, productIds);
            apiUtils.createResponse(200, responses);
        } else {
            let httpCode = 400;
            return apiUtils.createError(httpCode, {
                title: 'Enable Store Pickup Disabled',
                type: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/' + httpCode,
                detail: 'The custom preference Enable Store Pickup is set to false'
              });
        }
    } catch (e) {
        logHandler.logger.error(e, 'CustomAPI', 'Store-availability');
        let httpCode = e.httpCode || 500;
        apiUtils.createError(httpCode, {
            title: e.name || 'OOPS: Internal Server Error',
            type: e.type || 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/' + httpCode,
            detail: e.message
        });
    }
}

exports.getStoreAvailability.public = true;