'use strict'
/**
 * @namespace PayPal
 */
const basketMGR = require('dw/order/BasketMgr');
const txn = require('dw/system/Transaction');
const PayPalService = require('int_radial_composable/cartridge/scripts/payments/paypal/PaypalService.js');
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;
const paymentMgr = require('dw/order/PaymentMgr');
const BasketHelper = require('app_composable/cartridge/scripts/helpers/objects/basket.js');
const ShippingMgr = require('dw/order/ShippingMgr');
const Site = require("dw/system/Site").getCurrent();
const ShipmentHelper = require('app_composable/cartridge/scripts/helpers/objects/shipment.js');
const GCService = require('int_radial_composable/cartridge/scripts/payments/GiftCard/GiftCardServiceHelper.js');
const StoreMgr = require('dw/catalog/StoreMgr');
const Resource = require('dw/web/Resource');
const RadialHelpers = require('int_radial_composable/cartridge/scripts/helpers/RadialHelper.js');
const orderAddress = require('app_composable/cartridge/scripts/helpers/objects/orderAddress.js');
const helper = require('app_composable/cartridge/scripts/helpers/shopperBaskets/updateShippingAddressForShipment');

/**
 * Gets the data the customer has inputed into the paypal modal and updates the basket
 * @function getExpress
 * @memberof PayPal
 * @param {string} PaypalRedirectSource
 * @param {String} buttonId - the id of the paypal button clicked, used to identify the correct payment instrument when multiple paypal buttons are on the page
 * @return {Object} - Response code and message
 */
function getExpress(PaypalRedirectSource, buttonId) {
    let responseObj = { ResponseCode: 'Success' };
    //Throw Error since no basket exsists
    let basket = basketMGR.getCurrentBasket();
    if (empty(basket)) throw (new Error('No Basket : Get Express'));

    //Throw Error since paypal payment method doesn't exsist
    let paypalPaymentMethod = paymentMgr.getPaymentMethod('PayPal');
    if (empty(paypalPaymentMethod)) {
        responseObj.ResponseCode = 'Failure'
        responseObj.ErrorMessage = Resource.msg('failed', 'paypal', null)
        return responseObj
    }
    if (Site.getCustomPreferenceValue('EnableVenmo') && empty(paymentMgr.getPaymentMethod('Venmo'))) {
        responseObj.ResponseCode = 'Failure'
        responseObj.ErrorMessage = Resource.msg('failed', 'paypal', null)
        return responseObj
    }

    let paymentInstrument = RadialHelpers.getPayPalPaymentInstrument(basket, buttonId);
    const token = JSON.parse(paymentInstrument.custom.customData).token;
    const paymentProcessor = paypalPaymentMethod.paymentProcessor
    const basketStore = basket.custom.preferredStore;
    const result = PayPalService.getPaypalData(token, basket);
    let shipmentCorrected = false;
    let isBasketBopisOnly = false;
    //Radial Responsed with Success
    if (result.ResponseCode == 'Success') {
        const validationResult = validateGetExpressResponse(result);
        //Validated info returned from paypal is valid.
        if (validationResult.ResponseCode === 'Failure') {
            return validationResult;
        }
        let storePickupShipment = !empty(basketStore) ? BasketHelper.getShipment(basket, basketStore) : null;
        let shippingShipment = BasketHelper.getShipment(basket);
        isBasketBopisOnly = empty(shippingShipment) && !empty(storePickupShipment);
        setBillingAdressData(result, basket);
        if (PaypalRedirectSource == 'cart') {
            /**
             * Shipping info from PayPal
             */
            if (!empty(shippingShipment)) {
                let shippingAddress = empty(shippingShipment.shippingAddress) ? shippingShipment.createShippingAddress() : shippingShipment.shippingAddress;
                shippingAddress.setFirstName(result.PayerName.FirstName);
                shippingAddress.setLastName(result.PayerName.LastName);
                shippingAddress.setAddress1(result.ShippingAddress.Line1);
                shippingAddress.setAddress2(result.ShippingAddress.Line2);
                shippingAddress.setCity(result.ShippingAddress.City);
                shippingAddress.setPhone(result.PayerPhone);
                shippingAddress.setPostalCode(result.ShippingAddress.PostalCode);
                shippingAddress.setCountryCode(result.ShippingAddress.CountryCode);
                shippingAddress.setStateCode(PayPalService.parseStateCode(result.ShippingAddress.MainDivision.toString()));
                orderAddress.sanitizeAddress(shippingAddress);
            }
            if (!empty(storePickupShipment)) {
                let storeAddress = empty(storePickupShipment.shippingAddress) ? storePickupShipment.createShippingAddress() : storePickupShipment.shippingAddress;
                const store = StoreMgr.getStore(storePickupShipment.custom.fromStoreId);
                storeAddress.setFirstName(store.name);
                storeAddress.setLastName(' ');
                storeAddress.setAddress1(store.getAddress1());
                storeAddress.setAddress2(!empty(store.getAddress2()) ? store.getAddress2() : '');
                storeAddress.setCity(store.getCity());
                storeAddress.setPhone(store.getPhone().replace(/[\s()-]+/g, ''));
                storeAddress.setPostalCode(store.getPostalCode());
                storeAddress.setCountryCode(store.getCountryCode());
                storeAddress.setStateCode(store.getStateCode());
                orderAddress.sanitizeAddress(storeAddress);
            }
        }

        /**
         * Set Alternate pickup person on store pickup shipment
         */
        if (!empty(storePickupShipment)) {
            storePickupShipment.custom.pickupPersonFirstName = result.PayerName.FirstName;
            storePickupShipment.custom.pickupPersonLastName = result.PayerName.LastName;
        }

        //Handle Payment instrument
        let paymentTransaction = paymentInstrument.getPaymentTransaction();
        paymentTransaction.setPaymentProcessor(paymentProcessor);
        paymentTransaction.custom.RadialPaypalPayerID = result.PayerId + '';
        paymentTransaction.custom.RadialPaypalToken = token;
        paymentTransaction.custom.RadialPayPalPayerStatus = result.PayerStatus + '';

        let RadialPaypalBillingAddressStatus = '';
        if (!empty(result.BillingAddress) && !empty(result.BillingAddress.AddressStatus)) {
            RadialPaypalBillingAddressStatus = result.BillingAddress.AddressStatus + '';
        }
        paymentTransaction.custom.RadialPaypalBillingAddressStatus = RadialPaypalBillingAddressStatus;

        //Set customer Email on basket
        if (empty(basket.customerEmail) && !empty(result.PayerEmail)) {
            basket.setCustomerEmail(result.PayerEmail + '');
        }

        if (!empty(shippingShipment) && PaypalRedirectSource == 'cart') {
            let applicableShipMethods = ShippingMgr.getShipmentShippingModel(shippingShipment).getApplicableShippingMethods();
            let shippingMethod = !empty(shippingShipment) ? shippingShipment.shippingMethod : null;
            const standardShippingMethod = applicableShipMethods.toArray().find(e => e.displayName === 'Standard');
            if (!empty(standardShippingMethod)) {
                shippingShipment.setShippingMethod(standardShippingMethod);
                shipmentCorrected = true;
            }
            else if (!empty(shippingMethod)) {
                const alternateMethod = applicableShipMethods.toArray().find(e => e.displayName === shippingMethod.displayName);
                if (!empty(alternateMethod)) {
                    shippingShipment.setShippingMethod(alternateMethod);
                    shipmentCorrected = true;
                }
            }

            /**
             * additional logic to handle shipping restrictions needs to be revisited to use comp methods once BBWDP-18516 is in
             */
            let hazmatItems = ShipmentHelper.getHazmatRestrictedItems(shippingShipment);
            if (hazmatItems.length > 0) {
                let applicableShipMethods = ShippingMgr.getShipmentShippingModel(shippingShipment).getApplicableShippingMethods();
                let hazmatShippingMethods = applicableShipMethods.toArray().filter(e => 'defaultHazmatShippingMethod' in e.custom && e.custom.defaultHazmatShippingMethod);
                if (hazmatShippingMethods.length > 0) {
                    shippingShipment.setShippingMethod(hazmatShippingMethods.shift());
                } else {
                    responseObj.ResponseCode = 'Failure'
                    responseObj.ErrorMessage = Resource.msg('shipping-restrictions', 'paypal', null);

                    return responseObj;
                }
            }
            let shippingAddress = shippingShipment.shippingAddress;
            let countryCode = shippingAddress.countryCode.value.toUpperCase();
            let stateCode = shippingAddress.stateCode.toUpperCase();
            /**
             * CBD product restrictions
             */
            const enableCBDRestriction = Site.preferences.custom.EnableCBDRestriction;
            if (enableCBDRestriction) {
                if (countryCode == 'CA' || !empty(stateCode)) {
                    const CBDRestrictedProducts = ShipmentHelper.getNonHazmatRestrictedItems(shippingShipment);
                    if (CBDRestrictedProducts.length > 0) {
                        responseObj.ResponseCode = 'Failure'
                        responseObj.ErrorMessage = Resource.msg('shipping-restrictions', 'paypal', null);

                        return responseObj;
                    }
                }
            }

            /**
             * non hazmat items restrictions
             */
            let restrictedItems = ShipmentHelper.getNonHazmatRestrictedItems(shippingShipment);
            if (countryCode == 'CA') {
                if (GCService.isBasketHasPhysicalCards(basket)) {
                    restrictedItems = restrictedItems.concat(GCService.getPhysicalGiftCards(basket));
                }
                restrictedItems = restrictedItems.concat(basket.allProductLineItems.toArray().filter(e => 'isAutoRefreshSubscribedItem' in e.custom && e.custom.isAutoRefreshSubscribedItem))
            }

            if (restrictedItems.length > 0) {
                responseObj.ResponseCode = 'Failure'
                responseObj.ErrorMessage = Resource.msg('shipping-restrictions', 'paypal', null);
                return responseObj
            }
        }
    }
    else {
        //Radial failed for one reason or another.
        logHandler.logger.error({ message: result.ErrorMessage }, 'CustomAPI', 'getExpress')
        responseObj.ResponseCode = 'Failure'
        responseObj.ErrorMessage = Resource.msg('radial-fail', 'paypal', null)
        return responseObj
    }

    // add isPayPal to session for taxes fix
    if (Site.getCustomPreferenceValue('ReduceTaxCalls')) {
        //Will need to fix this :/ after calculate is rewritten.
        dw.system.HookMgr.callHook("dw.order.calculate", "calculate", basket);
    }


    if (!shipmentCorrected && !isBasketBopisOnly && PaypalRedirectSource == 'cart') {
        responseObj.ResponseCode = 'Failure'
        responseObj.ErrorMessage = Resource.msg('shipping-restrictions', 'paypal', null);
    }

    return responseObj;
}

/**
 * Sets the billing address from the radial XML
 * @function setBillingAdressData
 * @memberof PayPal
 * @param {XML} xml
 * @param {Basket} basket : The current basket
 */
function setBillingAdressData(xml, basket) {
    let billingAddress = basket.getBillingAddress();
    if (billingAddress == null) {
        billingAddress = basket.createBillingAddress();
    }
    billingAddress.setFirstName(xml.PayerName.FirstName);
    billingAddress.setSecondName(xml.PayerName.MiddleName);
    billingAddress.setLastName(xml.PayerName.LastName);
    billingAddress.setSalutation(xml.PayerName.Honorific);
    billingAddress.setAddress1(xml.BillingAddress.Line1);
    billingAddress.setAddress2(xml.BillingAddress.Line2);
    billingAddress.setCity(xml.BillingAddress.City);
    billingAddress.setPhone(xml.PayerPhone);
    billingAddress.setPostalCode(xml.BillingAddress.PostalCode);
    billingAddress.setCountryCode(xml.BillingAddress.CountryCode);
    billingAddress.setStateCode(PayPalService.parseStateCode(xml.BillingAddress.MainDivision.toString()));
    orderAddress.sanitizeAddress(billingAddress);
}

/**
 * Sets the data required to initialize the paypal session
 * @function setExpress
 * @memberof PayPal
 * @param {String} PaypalRedirectSource
 * @param {String} buttonId - the id of the paypal button clicked, used to identify the correct payment instrument when multiple paypal buttons are on the page
 * @return {Object} - Response code and message
 */
function setExpress(PaypalRedirectSource, buttonId) {
    let basket = basketMGR.getCurrentBasket();
    if (!empty(basket)) {
        RadialHelpers.cleanPayPalPaymentInstruments(basket);
        const result = PayPalService.SetExpress(basket, PaypalRedirectSource)//.getServiceObject('roms.paypal.setexpress','roms.paypal.setexpress').call(message)

        if (!empty(result.ResponseCode)) {
            let paymentInstrument = RadialHelpers.getPayPalPaymentInstrument(basket, buttonId);
            if (result.ResponseCode == 'Success') {
                let token = result.Token;
                let baseRedirectUrl = RadialHelpers.getPayPalRedirectUrl();
                if (!baseRedirectUrl.match(/\?$/)) {
                    baseRedirectUrl += '?';
                }
                baseRedirectUrl += 'cmd=_express-checkout&token=' + token;
                let PaypalRedirectUrl = baseRedirectUrl;
                paymentInstrument.custom.customData = JSON.stringify({ token: token })
                return { ResponseCode: 'Success', PaypalRedirectUrl: PaypalRedirectUrl, token: token }
            }
            else {
                logHandler.logger.info({ message: result.ErrorMessage }, 'CustomAPI', 'setExpress')
                return { ResponseCode: 'Failure', error: Resource.msg('failed', 'paypal', null) }
            }
        }
        else {
            logHandler.logger.error({ message: 'PayPal timeout' }, 'CustomAPI', 'setExpress')
            return { ResponseCode: 'Failure', error: Resource.msg('radial-fail', 'paypal', null) }
        }
    }
    else {
        throw (new Error('No Basket : Set Express'))
    }
}

/**
 * Validates the paypal get express result address
 * @function validateGetExpressResponse
 * @memberof PayPal
 * @param {XML} result
 * @returns {Object} and error object or null
 */
function validateGetExpressResponse(result) {
    let responseObj = { ResponseCode: 'OK' };
    const shipCountry = result.ShippingAddress.CountryCode.toString().toUpperCase();
    const allowedCountries = Site.getCustomPreferenceValue('allowedShippingAddressCountryCodes');

    if (!empty(allowedCountries) && allowedCountries.indexOf(shipCountry) == -1) {
        responseObj.ResponseCode = 'Failure';
        responseObj.ErrorMessage = Site.getCustomPreferenceValue('allowedShippingAddressCountryErrMsg');
        return responseObj;
    }

    if (shipCountry == 'CA' && !empty(validatePostalCodeToProvince(result))) {
        responseObj.ResponseCode = 'Failure';
        responseObj.ErrorMessage = Resource.msg('invalid-province-address', 'paypal', null);
        return responseObj;
    }

    if (!empty(result.BillingAddress) && !empty(result.BillingAddress.MainDivision)) {
        if (result.BillingAddress.MainDivision == 'null' || empty(PayPalService.parseStateCode(result.BillingAddress.MainDivision.toString()))) {
            responseObj.ResponseCode = 'Failure';
            responseObj.ErrorMessage = Resource.msg('invalid-state-billing', 'paypal', null);
            return responseObj;
        }
    }

    if (!empty(result.ShippingAddress) && !empty(result.ShippingAddress.MainDivision)) {
        if (result.ShippingAddress.MainDivision == 'null' || empty(PayPalService.parseStateCode(result.ShippingAddress.MainDivision.toString()))) {
            responseObj.ResponseCode = 'Failure';
            responseObj.ErrorMessage = Resource.msg('invalid-state-shipping', 'paypal', null);
            return responseObj;
        }
    }

    /**
*ensure no special characters are in Line1, Line2
*/
    if (!PayPalService.addressCheck(result.ShippingAddress.Line1.toString()) || !PayPalService.addressCheck(result.BillingAddress.Line1.toString())) {
        responseObj.ResponseCode = 'Failure';
        responseObj.ErrorMessage = Resource.msg('invalid-street', 'paypal', null);
        return responseObj;
    }

    let shippingAddrLineTwo = result.ShippingAddress.Line2.toString();
    let billingAddrLineTwo = result.BillingAddress.Line2.toString();
    if ((!empty(shippingAddrLineTwo) && !PayPalService.addressCheck(shippingAddrLineTwo)) || (!empty(billingAddrLineTwo) && !PayPalService.addressCheck(billingAddrLineTwo))) {
        responseObj.ResponseCode = 'Failure';
        responseObj.ErrorMessage = Resource.msg('invalid-street', 'paypal', null);
        return responseObj;
    }
    /**
     * ensure no special characters are in Payer First Name, Last Name
    */

    if (!PayPalService.payerNameCheck(result.PayerName.FirstName.toString()) || !PayPalService.payerNameCheck(result.PayerName.LastName.toString())) {
        responseObj.ResponseCode = 'Failure';
        responseObj.ErrorMessage = Resource.msg('invlaid-name', 'paypal', null);
        return responseObj;
    }

    /*
     * ensure the postal code is valid
     */
    if (!PayPalService.payerPostalCheck(result.ShippingAddress.PostalCode.toString())) {
        responseObj.ResponseCode = 'Failure';
        responseObj.ErrorMessage = Resource.msg('invalid-zip-code-shipping', 'paypal', null);
        return responseObj;
    }
    if (!PayPalService.payerPostalCheck(result.BillingAddress.PostalCode.toString())) {
        responseObj.ResponseCode = 'Failure';
        responseObj.ErrorMessage = Resource.msg('invalid-zip-code-billing', 'paypal', null);
        return responseObj;
    }
    /*
     * ensure the city is valid
     */
    if (!PayPalService.payerCityCheck(result.ShippingAddress.City.toString())) {
        responseObj.ResponseCode = 'Failure';
        responseObj.ErrorMessage = Resource.msg('invalid-city-shipping', 'paypal', null);
        return responseObj;
    }
    if (!PayPalService.payerCityCheck(result.BillingAddress.City.toString())) {
        responseObj.ResponseCode = 'Failure';
        responseObj.ErrorMessage = Resource.msg('invalid-city-billing', 'paypal', null);
        return responseObj;
    }
    return responseObj;
}


/**
 * Validates the address returned from Paypal's external payment.
 * @param {Object} getPaypalResult The result from a call to Paypal.
 * @return {String|null} An error message in case of errors, or null otherwise.
 */
function validatePostalCodeToProvince(getPaypalResult) {
    let result;
    const billingAddress = getPaypalResult.BillingAddress;
    const shippingAddress = getPaypalResult.ShippingAddress;

    // If there is a missing address property, send paypal error
    if (isAddressEmpty(billingAddress) && isAddressEmpty(shippingAddress)) {
        result = Resource.msg('paypal.error.general.invalid.address', 'radial', null);
        return result;
    }

    result = validatePostalCode(billingAddress.PostalCode.toString()) || validatePostalCode(shippingAddress.PostalCode.toString());
    result = result || matchPostalCodeToProvince(billingAddress.PostalCode.toString(), billingAddress.MainDivision.toString()) || matchPostalCodeToProvince(shippingAddress.PostalCode.toString(), shippingAddress.MainDivision.toString());
    return result;
}

/**
 * Validate Length of Address fields
 * @param {Address} address The address object.
 * @returns {boolean} True if it encouters an error, else returns false.
 */
function isAddressEmpty(address) {
    return empty(address.Line1) ||
        empty(address.City) ||
        empty(address.FirstName) ||
        empty(address.LastName);
}

/**
 * Validates a postal code.
 * @param {String} postalCode The input postal code.
 * @returns {String|null} An error message, or null if no error is found.
 */
function validatePostalCode(postalCode) {
    const postalCodeRegex = /[A-Z][0-9][A-Z] ?[0-9][A-Z][0-9]/g;
    const matches = postalCode.match(postalCodeRegex);

    if (matches && matches.length == 1 && matches[0] == postalCode) {
        return null;
    }

    return Resource.msg('paypal.error.postalCode', 'radial', null);
}

/**
 * Validates whether the postal code of an address matches its province.
 * @param {String} postalCode The input postal code.
 * @param {String} province The input province.
 * @return {String|null} An error message, or null if no errors are found.
 */
function matchPostalCodeToProvince(postalCode, province) {
    if (helper.isPostalCodeValid(postalCode, province)) {
        return null;
    } else {
        return Resource.msg('paypal.error.postalCodeAndProvince', 'radial', null);
    }
}

module.exports = {
    getExpress,
    setExpress
}
