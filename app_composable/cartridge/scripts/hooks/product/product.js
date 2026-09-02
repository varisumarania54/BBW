/**
 * @module product.js
 * @namespace Product
 */
'use strict';

const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;
const Status = require('dw/system/Status');
const productHelper = require('app_composable/cartridge/scripts/helpers/objects/product.js');
const BopisOrderLimits = require('app_composable/cartridge/scripts/helpers/global/BopisOrderLimits.js');
const cacheTTLManager = require('app_composable/cartridge/scripts/helpers/util/cacheTTLManager.js');
const ForceSoldOutHelper = require('app_composable/cartridge/scripts/helpers/global/ForceSoldOutHelper.js');
const Site = require('dw/system/Site').getCurrent();

/** 
 * modifyGETResponse Product hook functionality to modified and add custom attribute values 
 * @function modifyGETResponse
 * @memberof Product
 * @param {object} product - product object
 * @param {object} doc - response object from product
 * @return {object} doc - original response object with modified custom attribute values.
 */
exports.modifyGETResponse = function (product, doc) {
    // storeId we will get from param of url
    const storeId = !empty(request.httpParameterMap.c_storeId) ? request.httpParameterMap.c_storeId.stringValue : null;
    try {
        // Start of BBWDP-16973
        if (Site.getCustomPreferenceValue("enableSupportForhidePromoCalloutAndDetailsOnQualifyingItems") && !empty(doc.productPromotions)) {
            productHelper.filterProductPromotions(doc, product);
        }
        doc.c_productName = productHelper.getProductName(product);
        doc.c_productNameTranslationRequired = productHelper.productNameTranslationRequired(product);
        // End of BBWDP-16973
        doc.c_listPrice = productHelper.getProductStandardPrice(product);
        doc.c_salePrice = productHelper.getProductSalePrice(product);
        doc.c_categoryLimit = !empty(product.primaryCategory) ? BopisOrderLimits.getCategoryQtyLimit(product.primaryCategory.ID) : null;
        doc.c_purchaseLimit = {};
        doc.c_purchaseLimit.categoryLimit = doc.c_categoryLimit;
        doc.c_purchaseLimit.webLimit = BopisOrderLimits.getPurchaseLimit(product);

        doc.c_forceSoldOut = ForceSoldOutHelper.isMarkedAsSoldOutProduct(product);

        if (!empty(doc.slugUrl)) {
            doc.slugUrl = doc.slugUrl.replace('.html', '');
        }  

        if (storeId) {
            doc.c_purchaseLimit.bopisLimit = BopisOrderLimits.getPurchaseLimit(product, storeId);
            doc.c_isBopisStoreAvailable = BopisOrderLimits.isBopisStoreAvailable(storeId);
            doc.c_hasInvInNearbyStores = productHelper.hasInventoryNearbyStores(product, storeId);
        }

        cacheTTLManager.setResponseTTL();

    } catch (e) {
        logHandler.logger.error(e, 'Hooks', 'product');
        return new Status(Status.ERROR);
    }
};
