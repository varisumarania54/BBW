'use strict';
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;
var Status = require('dw/system/Status');
var helper = require('app_composable/cartridge/scripts/helpers/shopperBaskets/getShippingMethodsForShipmentHelper.js')

exports.modifyGETResponse_v2 = function (shipment : dw.order.Shipment, shippingMethodResult : ShippingMethodResult) {
    try {
        helper.filterShippingMethods(shipment, shippingMethodResult);
        helper.addEstimatedDeliveryToMethods(shippingMethodResult);
        helper.addHasInapplicableToMethods(shipment, shippingMethodResult);
        helper.getShippingMethodsCostForPGCOnly(shipment, shippingMethodResult);
    } catch (e) {
        logHandler.logger.error(e, 'Hooks', 'getshipMethodsMod');

        return new Status(Status.ERROR);
    }
}
