
'use strict';
const Status = require("dw/system/Status");
const validationsUtil = require('app_composable/cartridge/scripts/helpers/util/validationsUtil');
const addressHelpers = require('app_composable/cartridge/scripts/helpers/objects/orderAddress.js');
/**
 * Hook function for beforePOST of Shipment.
 *
 * @param {dw.order.Basket} basket - The current basket
 * @param {dw.order.Shipment} shipment - The current shipment
 * @returns {dw.system.Status} - The status of the hook
 */
exports.beforePOST = function(basket, shipment){
    addressHelpers.sanitizeAddress(shipment.shippingAddress);
    validationsUtil.validateRequestBody('Basket-Attributes');

    return new Status(Status.OK);
}

/**
 * Hook function for beforeDELETE of Shipment.
 *
 * @param {dw.order.Basket} basket - The current basket
 * @param {dw.order.Shipment} shipment - The current shipment
 * @returns {dw.system.Status} - The status of the hook
 */
exports.beforeDELETE = function(basket, shipment){

    validationsUtil.validateRequest(shipment, 'Basket-Attributes');

    return new Status(Status.OK);
}
