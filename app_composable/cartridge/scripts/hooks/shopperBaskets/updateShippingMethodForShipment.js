'use strict';
const ShipmentHelper = require('app_composable/cartridge/scripts/helpers/objects/shipment.js');
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;
const Status = require("dw/system/Status");
const getBasketHelper = require("app_composable/cartridge/scripts/helpers/shopperBaskets/getBasketHelper.js")
const validationsUtil = require('app_composable/cartridge/scripts/helpers/util/validationsUtil');
const errorHandler = require('app_composable/cartridge/scripts/helpers/util/errorHandler.js').errorHandler;
const ShippingMgr = require('dw/order/ShippingMgr');


exports.afterPUT = function (basket : dw.order.Basket, shipment : dw.order.Shipment, shippingMethod : ShippingMethod){
    try {
        if(!ShipmentHelper.shipmentMethodValid(shipment)){
            return new Status(Status.ERROR, '400', errorHandler.getErrorMessage('UPDATE-SHIPPING-METHOD-04-001'));
        }
        ShippingMgr.applyShippingCost(basket);
    }
    catch (e){
        logHandler.logger.error(e, 'Hooks', 'updateShipMethAfter');
        return new Status(Status.ERROR);
    }
}

exports.modifyPUTResponse = function (basket : dw.order.Basket, basketResponse : Basket, shippingMethodRequest : ShippingMethod){
    try {
        getBasketHelper.handleModify(basketResponse,basket);
        request.custom.optimized = true;
    }
    catch (e){
        logHandler.logger.error(e, 'Hooks', 'updateShipMethModify');
        return new Status(Status.ERROR);
    }
}

exports.beforePUT = function (basket, shipment, shippingMethod){

    validationsUtil.validateRequestBody('Basket-Attributes');

    return new Status(Status.OK);
}
