'use strict';

const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;
const Status = require("dw/system/Status");
const getBasketHelper = require("app_composable/cartridge/scripts/helpers/shopperBaskets/getBasketHelper.js")
const helper = require('app_composable/cartridge/scripts/helpers/shopperBaskets/updateShippingAddressForShipment.js');
const Resource = require('dw/web/Resource');
const addressHelpers = require('app_composable/cartridge/scripts/helpers/objects/orderAddress.js');
const addressUtils = require('app_composable/cartridge/scripts/helpers/util/addressUtil');

/**
 * Hook function for beforePUT of billingAddress.
 *
 * @param {dw.order.Basket} basket - The current basket
 * @param {dw.order.Shipment} billingAddress - Billig Address
 * @returns {dw.system.Status} - The status of the hook
 */
exports.beforePUT = function (basket, billingAddress) {
    try{
        addressUtils.removeEmojisFromAddress(billingAddress)
    }catch(e){
        logHandler.logger.error(e, 'Hooks', 'updateBilling');
    }

    // Validate if the postal code is valid for the given state code
    if (!helper.isPostalCodeValid(billingAddress.postalCode, billingAddress.stateCode)) {
        // Return an error status if the postal code is invalid
        return new Status(Status.ERROR, '400', Resource.msg('error.postal.code.province', 'checkout', null))
    }
    addressHelpers.sanitizeAddress(billingAddress);
}

exports.modifyPUTResponse = function (basket: dw.order.Basket, basketResponse: Basket, addressRequest: OrderAddress) {
    try {
        getBasketHelper.handleModify(basketResponse, basket);
    }
    catch (e) {
        logHandler.logger.error(e, 'Hooks', 'updateBillingModify');
        return new Status(Status.ERROR);
    }
}
