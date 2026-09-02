'use strict';
const Status = require('dw/system/Status');
const BopisOrderLimits = require('app_composable/cartridge/scripts/helpers/global/BopisOrderLimits.js');
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler; 

/**
 * Functions used in the Custom Store Availability API endpoint
 * @namespace StoreAvailabilityAPI
 */

/**
 * This function returns list of productId's based on its store availability status
 * @function storeAvailability
 * @param {string} storeId 
 * @param {string} productIds 
 * @returns {Object} JSON with productId and respective products store availability status.
 * @memberof StoreAvailabilityAPI
 */
exports.storeAvailability = function storeAvailability(storeId, productIds) {
    try {
        let responseJSON = {};
        let productIdArray = productIds.split(',');

        // Check business logic and pass off if BOPIS store is available to the refinement template.
        const isBopisStoreAvailable = !empty(storeId) ? BopisOrderLimits.isBopisStoreAvailable(storeId) : false;
        if (!isBopisStoreAvailable) {
            productIdArray.forEach((productId) => {
                responseJSON[productId] = false;
            })
        } else {
            productIdArray.forEach((productId) => {
                let bopisAvailable = BopisOrderLimits.getProductStoreAvailabilityUsingCache(productId,storeId);
                responseJSON[productId] = bopisAvailable;
            });
        }

        return responseJSON;
    }
    catch (e) {
        logHandler.logger.error(e, 'Hooks', 'store-availability');
        return new Status(Status.ERROR);
    }
}
