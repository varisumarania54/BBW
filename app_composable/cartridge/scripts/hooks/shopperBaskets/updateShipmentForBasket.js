'use strict';
const addressHelpers = require('app_composable/cartridge/scripts/helpers/objects/orderAddress.js');


exports.beforePATCH = function (basket: dw.order.Basket, shipment: dw.order.Shipment, shipmentInfo: Shipment) {
    shipmentInfo.giftMessage = addressHelpers.sanitizeString(shipmentInfo.giftMessage);
}
