'use strict';
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;
const getBasketHelper = require("app_composable/cartridge/scripts/helpers/shopperBaskets/getBasketHelper.js")
const Status = require("dw/system/Status");
const basketHelper = require('app_composable/cartridge/scripts/helpers/objects/basket.js');

exports.modifyDELETEResponse = function (basket : dw.order.Basket, basketResponse : Basket, giftCertificateItemId : String){
    try {
        request.custom.itemRemoved = true
        getBasketHelper.handleModify(basketResponse,basket);
    }
    catch (e){
        logHandler.logger.error(e, 'Hooks', 'removeGcli');
        return new Status(Status.ERROR);
    }
}



exports.afterDELETE = function (basket : dw.order.Basket, giftCertificateItemId : String) {
    try {
        basketHelper.cleanUpProductLevelMessaging(basket);
    }
    catch (e){
        logHandler.logger.error(e, 'Hooks', 'removeGcli');
    }
}
