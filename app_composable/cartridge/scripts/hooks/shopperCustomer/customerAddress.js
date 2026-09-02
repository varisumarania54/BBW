'use strict';

const Status = require('dw/system/Status');
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler').logHandler;
const validateRequest = require('app_composable/cartridge/scripts/helpers/util/validationsUtil').validateRequest;

exports.beforePOST = function (customer, addressName, customerAddress) {
    try {
        if (customerAddress) {
            validateRequest(customerAddress, 'Customer-Attributes');
        }
        return new Status(Status.OK);
    } catch (e) {
        logHandler.logger.error(e, 'Hooks', 'customerAddress');
        return new Status(Status.ERROR, 'ERROR', e.message);
    }
}

exports.beforePATCH = function (customer, addressName, customerAddress) {
    try {
        if (customerAddress) {
            validateRequest(customerAddress, 'Customer-Attributes');
        }
        return new Status(Status.OK);
    } catch (e) {
        logHandler.logger.error(e, 'Hooks', 'customerAddress');
        return new Status(Status.ERROR, 'ERROR', e.message);
    }
}

exports.beforeDELETE = function (customer, addressName) {
    const addressBook = customer.getProfile().getAddressBook();
    const address = addressBook.getAddress(addressName);

    // If the customerAddress does not exist
    if (!address) {
        return new Status(Status.ERROR, 'Address does not exist');
    }

    return new Status(Status.OK);
}

exports.afterDELETE = function (customer, addressName) {
    let paymentInstruments = customer.getProfile().getWallet().getPaymentInstruments();

    // Remove any associations between customer payment instruments and the address that was just deleted
    for (let c = 0; c < paymentInstruments.length; c++) {
        const paymentInstrument = paymentInstruments[c];

        if (paymentInstrument.custom.BillingAddressID === addressName) {
            paymentInstrument.custom.BillingAddressID = '';
        }
    }

    return new Status(Status.OK);
}
