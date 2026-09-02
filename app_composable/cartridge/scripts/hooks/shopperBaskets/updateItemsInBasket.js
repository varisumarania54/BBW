'use strict';
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;
const getBasketHelper = require("app_composable/cartridge/scripts/helpers/shopperBaskets/getBasketHelper.js")
const Status = require("dw/system/Status");
const updateItemHelper = require("app_composable/cartridge/scripts/helpers/shopperBaskets/updateItemInBasketHelper.js")
const OGHelper = require("int_ordergroove/cartridge/scripts/composable/promotionHelper.js");
const BopisHelper = require('app_composable/cartridge/scripts/helpers/objects/BasketComponents/BopisHelper.js');
const basketHelper = require('app_composable/cartridge/scripts/helpers/objects/basket.js');
const Site = require('dw/system/Site');
const errorHandler = require('app_composable/cartridge/scripts/helpers/util/errorHandler.js').errorHandler;

exports.beforePATCH = function (basket: dw.order.Basket, items: ProductItem) {
    const switchAllParam = request.httpParameterMap["c_switchAll"];
    let switchAll = !empty(switchAllParam) && switchAllParam.stringValue === 'true';
    try {
        items.forEach(item => {
            if (!empty(item.itemId)) {
                let pli = basket.productLineItems.toArray().find(e => e.UUID == item.itemId);
                if (empty(pli)) {
                    throw new Error("No matching pli");
                }
                let preQty = item.quantity;
                request.custom.originalQty = item.quantity;
                updateItemHelper.handleQtyManipulation(basket, item, pli)
                updateItemHelper.handleItemConfig(basket, item, pli);
                if (preQty !== item.quantity && item.quantity == 0) {
                    item.quantity = pli.quantity.value;
                }
            }
        });
    }
    catch (e) {
        logHandler.logger.error(e, 'Hooks', 'updateItemsInBasket');
        if (switchAll) {
            return items.length > 1 ? errorHandler.errorStatus("SWITCHALL-01-001") : errorHandler.errorStatus("SWITCHALL-01-002");
        }
        return new Status(Status.ERROR);
    }
}

exports.afterPATCH = function (basket: dw.order.Basket, items: ProductItem) {
    if (Site.getCurrent().getCustomPreferenceValue('basketLimitEnabled') && request.custom.basketLimitOverride && request.custom.quantityAdded == 0) {
        let basketData = basketHelper.getBasketLimitData(basket);
        let limitData;
        if (items.some(item => {
            limitData = basketHelper.getLimitDataForCategory(request.custom.categoryID, basketData);
            if (limitData) {
                let category = request.custom.categoryName ? request.custom.categoryName : limitData.category;
                limitData.c_lineLevelError = dw.util.StringUtils.format(Site.getCurrent().getCustomPreferenceValue('basketLimitInlineCartError'), "'", limitData.limit, category)
                limitData.c_contributingProductMessage = Site.getCurrent().getCustomPreferenceValue('basketLimitQualifyingMessage');
                limitData.c_addToBagError = dw.util.StringUtils.format(Site.getCurrent().getCustomPreferenceValue('basketLimitAddToBagError'), "'", limitData.limit, category);
                limitData.c_itemsToShowError = items.filter(e => limitData.items.includes(e.itemId)).map(e => e.itemId)
                return true;
            }
        })) {
            return new Status(Status.ERROR, "400", JSON.stringify(limitData));
        }
    }
    const bopisItem = items.find(item => !empty(item.c_fromStoreId));
    if (!empty(bopisItem)) {
        request.custom.updatePreferredStore = BopisHelper.handlePreferredStore('addToCart', bopisItem.c_fromStoreId);
    }
    OGHelper.applyOGPromoToBasket(basket);
}

exports.modifyPATCHResponse = function (basket: dw.order.Basket, basketResponse: Basket, productItemId: String) {
    try {
        getBasketHelper.handleModify(basketResponse, basket);
    }
    catch (e) {
        logHandler.logger.error(e, 'Hooks', 'updateItemsInBasket');
        return new Status(Status.ERROR);
    }
}

