'use strict';
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;
const Status = require("dw/system/Status");
const getBasketHelper = require("app_composable/cartridge/scripts/helpers/shopperBaskets/getBasketHelper.js")
const hashHelper = require('app_composable/cartridge/scripts/helpers/util/cryptography.js');

exports.modifyPUTResponse = function(basket : dw.order.Basket, basketResponse : Basket, customerRequest : CustomerInfo) {
    try {
        getBasketHelper.handleModify(basketResponse,basket);
    }
    catch (e){
        logHandler.logger.error(e, 'Hooks', 'updateCustModify');
        return new Status(Status.ERROR);
    }
}

exports.afterPUT = function(basket : dw.order.Basket, customerInfo : CustomerInfo){
    try{
        basket.custom.emailHash = hashHelper.hash(customerInfo.email);
    }catch(e){
        logHandler.logger.error(e, 'Hooks', 'updateCustModify');
    }
}

