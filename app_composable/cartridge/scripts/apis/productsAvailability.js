'use strict';
const Status = require('dw/system/Status');
const BopisOrderLimits = require('app_composable/cartridge/scripts/helpers/global/BopisOrderLimits.js');
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;

/**
 * This function returns list of productId's based on availability status
 * @function getProductsAvailability
 * @param {string} storeId 
 * @param {string} productIds 
 * @returns {Object} JSON with productId and respective products store availability status.
 * @memberof productsAvailabilityAPI
 */
exports.getProductsAvailability = function getProductsAvailability(storeId, productIds) {
    try {
        const responseJSON = [];
        const productIdArray = productIds.split(',');
        const isBopisStoreAvailable = !empty(storeId) ? BopisOrderLimits.isBopisStoreAvailable(storeId) : false;
        //If bopis store not available
        if (!isBopisStoreAvailable) {
            productIdArray.forEach((productId) => {
                const product = dw.catalog.ProductMgr.getProduct(productId);  
                 if (!product) {
                   logHandler.logger.error('Product is null for productId: {0}', productId)
                    return;
                }              
                const webPurchaseLimit = BopisOrderLimits.getPurchaseLimit(product);                
                const webOrderable = product.availabilityModel ? product.availabilityModel.orderable : false; 
                const responseItem = {
                    sku: productId,
                    webPurchaseLimit: webPurchaseLimit,
                    webOrderable: webOrderable,
                };

                // Include BOPIS fields only if storeId is present
                if (!empty(storeId)) {
                    responseItem.bopisPurchaseLimit = 0;
                    responseItem.bopisStoreOrderable = false;
                }

                responseJSON.push(responseItem);
            });
        } else {//if bopis store available

            productIdArray.forEach((productId) => {
                const fullProduct = dw.catalog.ProductMgr.getProduct(productId);
                 if (!fullProduct) {
                   logHandler.logger.error('fullProduct is null for productId: {0}', productId)
                    return;
                }    
                let bopisAvailable = BopisOrderLimits.getProductStoreAvailabilityUsingCache(fullProduct,storeId);
                const webPurchaseLimit = BopisOrderLimits.getPurchaseLimit(fullProduct);
                const bopisLimit = bopisAvailable ? BopisOrderLimits.getPurchaseLimit(fullProduct, storeId) : 0;
                const webOrderable = fullProduct.availabilityModel ? fullProduct.availabilityModel.orderable : false;

                responseJSON.push({
                    sku: productId,
                    webPurchaseLimit: webPurchaseLimit,
                    webOrderable: webOrderable,
                    bopisPurchaseLimit: bopisLimit,
                    bopisStoreOrderable: bopisAvailable
                    
                });
            });
        }

        return responseJSON;
    } catch (e) {
        logHandler.logger.error(e, 'Hooks', 'product-availability');
        return new Status(Status.ERROR);
    }
};