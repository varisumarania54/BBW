'use strict';

const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;
const Status = require("dw/system/Status");
const Resource = require('dw/web/Resource');
const getBasketHelper = require("app_composable/cartridge/scripts/helpers/shopperBaskets/getBasketHelper.js")
const Logger = require("app_composable/cartridge/scripts/helpers/util/logHandler.js");
const BasketHelper = require("app_composable/cartridge/scripts/helpers/objects/basket.js");
const AVSService = require('int_radial_composable/cartridge/scripts/services/radialAVS/avsServiceHelper.js')
const helper = require('app_composable/cartridge/scripts/helpers/shopperBaskets/updateShippingAddressForShipment.js');
const addressHelpers = require('app_composable/cartridge/scripts/helpers/objects/orderAddress.js');
const addressUtil = require('app_composable/cartridge/scripts/helpers/util/addressUtil');

exports.beforePUT = function (basket, shipment, shippingAddress) {
    const validationResult = helper.isAddressAllowed(shippingAddress);
    if(!empty(validationResult)){
        return validationResult;
    }
    // Validate if the postal code is valid for the given state code
    if (!helper.isPostalCodeValid(shippingAddress.postalCode, shippingAddress.stateCode)) {
        // Return an error status if the postal code is invalid
        return new Status(Status.ERROR, '400', Resource.msg('error.postal.code.province', 'checkout', null))
    }
    addressHelpers.sanitizeAddress(shippingAddress);
    const requestBody = JSON.parse(request.httpParameterMap.requestBodyAsString);
    addressUtil.removeEmojisFromAddress(shippingAddress)
    if (!requestBody.c_skipAVS) {
        try {
            const AVSResponse = AVSService.validateAddress(shippingAddress);
            switch (AVSResponse.resultMessage) {
                case 'ShowSuggestions':
                    if(AVSResponse.suggestedAddresses.length > 0){
                        const addressMultiValidateError = new Status(Status.ERROR, "207", "AVS Returned More Than One Address");
                        addressMultiValidateError.addDetail("suggestedAddresses", JSON.stringify(AVSResponse.suggestedAddresses));
                        return addressMultiValidateError;
                    }
                    else{
                        const addressZeroValidateError = new Status(Status.ERROR, "204", "AVS Returned No Matching Addresses");
                        addressZeroValidateError.addDetail("suggestedAddresses", JSON.stringify(AVSResponse.suggestedAddresses));
                        return addressZeroValidateError;
                    }
                case 'UpdateAddress':
                         !empty(AVSResponse.suggestedAddresses) ? shippingAddress = BasketHelper.handleShippingAddressUpdate(shippingAddress, AVSResponse.suggestedAddresses) : '';
                    break;
                default:
            }

        } catch (e) {
            //log warning when avs is done or an error outside caught errors are found.
            //but let customer checkout
            Logger.logHandler.info(e, 'CustomAPI', 'RadialAVS');
        }
    }
}

/**
 * Handles actions after updating a shipping address in a PUT request.
 *
 * @param {dw.order.Basket} basket - The current basket.
 * @param {dw.order.Shipment} shipment - The shipment associated with the basket.
 * @param {Object} shippingAddress - The shipping address to be updated.
 */
exports.afterPUT = function (basket, shipment, shippingAddress) {
    // Parse the request body to access additional request parameters
    const requestBody = JSON.parse(request.httpParameterMap.requestBodyAsString);

    // Check if the address should be saved to the customer's address book
    if (requestBody.c_saveToAddresses && customer && customer.getProfile()) {
        try {
            // Save the shipping address to the customer's address book
            addressUtil.saveAddressToCustomerAddressBook(shippingAddress, customer);

        } catch (e) {
            // Log any errors encountered during address saving process
            Logger.logHandler.info(e, 'CustomAPI', 'SaveToAddresses');
        }
    }
    if(!empty(requestBody.c_useAsBilling) && requestBody.c_useAsBilling){
        addressUtil.updateBillingAddressWithShippingAddress(basket, shippingAddress)
    }
}

exports.modifyPUTResponse = function (basket: dw.order.Basket, basketResponse: Basket, shippingMethodRequest: ShippingMethod) {
    try {
        getBasketHelper.handleModify(basketResponse, basket);
    }
    catch (e) {
        logHandler.logger.error(e, 'Hooks', 'updateShipAddModify');
        return new Status(Status.ERROR);
    }
}
