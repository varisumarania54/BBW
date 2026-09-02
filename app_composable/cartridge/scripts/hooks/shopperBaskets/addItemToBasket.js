/**
 * @module addItemToBasket.js
 * @namespace addItemToBasket.js
 */
'use strict';
const helper = require('app_composable/cartridge/scripts/helpers/shopperBaskets/addItemToBasketHelper.js');
const basketHelper = require('app_composable/cartridge/scripts/helpers/objects/basket.js');
const productHelper = require('app_composable/cartridge/scripts/helpers/objects/product.js');
const getBasketHelper = require("app_composable/cartridge/scripts/helpers/shopperBaskets/getBasketHelper.js")
const BopisOrderLimits = require("app_composable/cartridge/scripts/helpers/global/BopisOrderLimits.js");
const BopisHelper = require('app_composable/cartridge/scripts/helpers/objects/BasketComponents/BopisHelper.js');
const errorHandler = require('app_composable/cartridge/scripts/helpers/util/errorHandler.js').errorHandler;
const StoreMgr = require('dw/catalog/StoreMgr');
const validationsUtil = require('app_composable/cartridge/scripts/helpers/util/validationsUtil');
const Status = require('dw/system/Status');
const OGHelper = require("int_ordergroove/cartridge/scripts/composable/promotionHelper.js");
const UUIDUtils = require('dw/util/UUIDUtils');
const ProductMgr = require('dw/catalog/ProductMgr');
const Site = require('dw/system/Site');

/**
 * function to validate the product and store validity before adding item to cart.
 * @function beforePOST
 * @memberof addItemToBasket
 * @param {*} basket
 * @param {*} items
 */
exports.beforePOST = function (basket, items) {

    validationsUtil.validateRequestBody('Basket-Attributes');
    for (let i = 0; i < items.length; i++) {
        let pli, product;
        let item = items[i]
        product = ProductMgr.getProduct(item.productId);
        //check product validity
        if (empty(product)) {
            return new Status(Status.ERROR, "400", errorHandler.getErrorMessage('ADDITEM-04-001'));
        }
        let gcCheck = helper.validateGCInput(item, product);
        if (!empty(gcCheck)) {
            return gcCheck;
        }
        if (!product.custom.isGiftCard) {

            // check store validity
            if (!empty(item.c_fromStoreId) && !BopisOrderLimits.isBopisStoreAvailable(item.c_fromStoreId)) {
                return new Status(Status.ERROR, "400", errorHandler.getErrorMessage('ADDITEM-04-002', item.c_fromStoreId));
            }
            pli = basketHelper.getExsistingLineItemInCart(item.productId, basket, item.c_fromStoreId, false);
            if (!empty(pli) && !helper.zeroQuantityPassed(basket, item, pli)) {
                helper.setQtyWork(item, pli);
            }
            if (item.quantity > 0) {
                helper.purchaseLimitWork(basket, item, pli);
            }
        }
        request.custom.isGiftCard = product.custom.isGiftCard;
        if (item.quantity != 0) {
            request.custom.newPLI = empty(pli);
            helper.assignInventoryId(basket, item);
            helper.buildOrGetShipment(basket, item);
            if (product.custom.isGiftCard) {
                request.custom.shipmentID = item.shipmentId;
                item.shipmentId = basket.createShipment(UUIDUtils.createUUID()).ID
            }
            helper.addCustomAttributesToPli(basket, item, product);
            if (!empty(item.c_fromStoreId)) {
                request.custom.c_fromStoreId = item.c_fromStoreId;
            }
        }
        else {
            request.custom.newPLI = false;
        }
        request.custom.deletedItemId = item.quantity == 0 && !empty(pli) ? pli.productID : null;
    }
}

/**
 * function to set appropriate attributes for optimized calculate call
 * @function afterPOST
 * @memberof addItemToBasket
 * @param {*} basket
 * @param {*} items
 */

exports.afterPOST = function (basket, items) {
    if (request.custom.reason == "purchaseLimitReached" && request.custom.basketLimitOverride && request.custom.quantityAdded == 0) {
        return new Status(Status.ERROR, "BASKETLIMIT", dw.util.StringUtils.format(Site.getCurrent().getCustomPreferenceValue('basketLimitAddToBagError'), "'", request.custom.limit, request.custom.categoryName));
    }
    if (!empty(request.custom.c_fromStoreId)) {
        request.custom.updatePreferredStore = BopisHelper.handlePreferredStore('addToCart', request.custom.c_fromStoreId);
    }
    if (request.custom.isGiftCard) {
        let gc = basket.getShipment(items[0].shipmentID).productLineItems[0];
        gc.setShipment(basket.getShipment(request.custom.shipmentID));
    }
    let store = StoreMgr.getStore(basket.custom.preferredStore);
    if (!empty(store)) {
        BopisHelper.validateBagFeesInBasket(basket, store)
    }
    OGHelper.removeOGFromBasket(basket);

    OGHelper.applyOGPromoToBasket(basket);
}


/**
 * function to validate the modify post response hook to pass additional attributes around gift card and bopis in the response
 * @function modifyPOSTResponse
 * @memberof addItemToBasket
 * @param {*} basket
 * @param {*} basketResponse
 * @param {*} productItems
 */
exports.modifyPOSTResponse = function (basket, basketResponse, productItems) {
    basketResponse.c_pliCreated = request.custom.newPLI;
    basketResponse.c_notAddedError = request.custom.quantityAdded === 0;
    const product = productHelper.getProductAttributesUsingCache(productItems[0].productId);
    const isGiftCard = product.custom.isGiftCard || false;
    const isEGC = isGiftCard && (product.custom.isVirtual || false);
    basketResponse.c_PGC = isGiftCard && !isEGC;
    basketResponse.c_EGC = isGiftCard && isEGC;
    basketResponse.c_bopis = !empty(productItems[0].c_fromStoreId)
    basketResponse.c_updatePreferredStore = request.custom.updatePreferredStore
    getBasketHelper.handleModify(basketResponse, basket);
}
