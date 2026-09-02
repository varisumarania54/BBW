'use strict';
var getBasketHelper = require("app_composable/cartridge/scripts/helpers/shopperBaskets/getBasketHelper.js")
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;
var Status = require("dw/system/Status");
const BopisHelper = require('app_composable/cartridge/scripts/helpers/objects/BasketComponents/BopisHelper.js');
const StoreMgr = require('dw/catalog/StoreMgr');
exports.afterPOST = function (basket: dw.order.Basket) {
    basket.custom.RadialCustomerVisitTimeStart = Date.now();
    basket.custom.RadialCCAuthAttempts = 0;
    const requestBody = JSON.parse(request.httpParameterMap.requestBodyAsString);
    if (!empty(requestBody) && 'c_storeId' in requestBody && !empty(requestBody.c_storeId)) {
        const store = StoreMgr.getStore(requestBody.c_storeId);
        if (!empty(store)) {
            BopisHelper.setStoreOnBasket(store, basket);
        }
    }
}

exports.modifyPOSTResponse = function (basket: dw.order.Basket, basketResponse: Basket) {
    try {
        getBasketHelper.handleModify(basketResponse, basket);
        return new Status(Status.OK);
    }
    catch (e) {
        logHandler.logger.error(e, 'Hooks', 'createBasket');
        return new Status(Status.ERROR);
    }
}
