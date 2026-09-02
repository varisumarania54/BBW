'use strict';

const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;
const getBasketHelper = require('app_composable/cartridge/scripts/helpers/shopperBaskets/getBasketHelper.js');
const Status = require('dw/system/Status');
const updateItemHelper = require('app_composable/cartridge/scripts/helpers/shopperBaskets/updateItemInBasketHelper.js');
const basketHelper = require('app_composable/cartridge/scripts/helpers/objects/basket.js');
const OGHelper = require('int_ordergroove/cartridge/scripts/composable/promotionHelper.js');
const BopisHelper = require('app_composable/cartridge/scripts/helpers/objects/BasketComponents/BopisHelper.js');
const Site = require('dw/system/Site');
const errorHandler = require('app_composable/cartridge/scripts/helpers/util/errorHandler.js').errorHandler;

/**
 * Hook dw.ocapi.shop.basket.item.beforePATCH
 *
 * @param {dw.order.Basket} basket
 * @param {ProductItem} item
 * @returns {dw.system.Status}
 */
exports.beforePATCH = function (basket, item) {
    const switchAllParam = request.httpParameterMap["c_switchAll"];
    let switchAll = !empty(switchAllParam) && switchAllParam.stringValue === 'true';
    try {
        item.itemId = request.SCAPIPathParameters['itemId'];
        let pli = basket.productLineItems.toArray().find(e => e.UUID == item.itemId);
        if (empty(pli)) {
            throw new Error("No matching pli");
        }
        const preQty = item.quantity;
        request.custom.originalQty = item.quantity;
        request.custom.pliOriginalQty = pli.quantity;
        updateItemHelper.handleQtyManipulation(basket, item, pli);
        const returnStatus = item.quantity == 0 ? null : updateItemHelper.handleItemConfig(basket, item, pli);
        request.custom.deletedItemId = item.quantity == 0 ? pli.productID : null;
        if (preQty != item.quantity && item.quantity == 0 && preQty != 0) {
            item.quantity = pli.quantity.value;
        }
        if (!empty(returnStatus)) {
            return returnStatus;
        }
    } catch (e) {
        logHandler.logger.error(e, 'Hooks', 'updateItemInBasket');
        if (switchAll) {
            return errorHandler.errorStatus("SWITCHALL-01-002");
        }
        return new Status(Status.ERROR);
    }
};

/**
 * Hook dw.ocapi.shop.basket.item.afterPATCH
 *
 * @param {dw.order.Basket} basket
 * @param {ProductItem} item
 */
exports.afterPATCH = function (basket, item) {
    //Susceptible to change when calculate is re written
    if (Site.getCurrent().getCustomPreferenceValue('basketLimitEnabled') && request.custom.basketLimitOverride && request.custom.quantityAdded == 0) {
        let limitData = basketHelper.getLimitDataForCategory(request.custom.categoryID, basketHelper.getBasketLimitData(basket));
        if (limitData) {
            let category = request.custom.categoryName ? request.custom.categoryName : limitData.category;
            limitData.c_lineLevelError = dw.util.StringUtils.format(Site.getCurrent().getCustomPreferenceValue('basketLimitInlineCartError'), "'", limitData.limit, category)
            limitData.c_contributingProductMessage = Site.getCurrent().getCustomPreferenceValue('basketLimitQualifyingMessage');
            limitData.c_addToBagError = dw.util.StringUtils.format(Site.getCurrent().getCustomPreferenceValue('basketLimitAddToBagError'), "'", limitData.limit, category);
            limitData.c_itemsToShowError = [item.itemId]
            return new Status(Status.ERROR, "400", JSON.stringify(limitData));
        }
    }
    if (!empty(item.c_fromStoreId)) {
        request.custom.updatePreferredStore = BopisHelper.handlePreferredStore('addToCart', item.c_fromStoreId);
    }
    OGHelper.applyOGPromoToBasket(basket);
    basketHelper.cleanUpProductLevelMessaging(basket);
};

/**
 * Hook dw.ocapi.shop.basket.item.modifyPATCHResponse
 *
 * @param {dw.order.Basket} basket
 * @param {Basket} basketResponse
 * @param {String} productItemId
 * @returns {dw.system.Status}
 */
exports.modifyPATCHResponse = function (basket, basketResponse, productItemId) {
    try {
        getBasketHelper.handleModify(basketResponse, basket);
    } catch (e) {
        logHandler.logger.error(e, 'Hooks', 'updateItemInBasket');
        return new Status(Status.ERROR);
    }
};
