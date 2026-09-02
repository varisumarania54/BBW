
/**
 * A namespace.
 * @namespace OrderAddress
 */

'use strict';

const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;

/**
 * modify the shipping address with correction from Radial AVS ie. 9 digit postal code
 * @function updateCurrentAddressWithRadialAddress
 * @memberof OrderAddress
 * @param {OrderAddress} address - the address to update
 * @param {Object} radialAddress - the address to update
 */
function updateAddressWithRadialAddress(address, radialAddress) {
    Object.keys(radialAddress).forEach(key => {
        if (key in address && key !== "ID") {
            address[key] = radialAddress[key].toString()
        }
    })
}

/**
 * Checks if an order address have all the fields
 * @function isAddressValid
 * @memberof OrderAddress
 * @param {dw.order.OrderAddress} address - the address to be validated
 * @returns {boolean}
 */
function isAddressValid(address) {
    return !empty(address) &&
        !empty(address.city) &&
        !empty(address.stateCode) &&
        !empty(address.postalCode);
};

/**
 * @function sanitizeString
 * @memberof Basket
 * @param {String} addressLine - an address line
 * @returns {Object} the modified addressLine with ' instead of ´
 */
function sanitizeString(addressLine) {
    if (!empty(addressLine)) {
        addressLine = addressLine.replace(/[’´]/g, '\'')
            .replace(/Æ/g, 'AE')
            .replace(/æ/g, 'ae')
            .replace(/Œ/g, 'OE')
            .replace(/œ/g, 'oe')
            .replace(/&/g, 'and')
            .replace(/ᵉ/g, 'e')
            .replace(/ē/g, 'é')
            .replace(/–/g, '-')
            .replace(/[^0-9A-Za-záàâãéèêíïóôõöúçñÁÀÂÃÉÈÍÏÓÔÕÖÚÇÑ'?!:;,.…\(\) \. \-]/g, ''); // eslint-disable-line
    }
    return addressLine;
}

/**
 * @function sanitizeAddress
 * @memberof Basket
 * Sanitizes the addresses object
 * @param {dw.order.OrderAddress} address The adress
 */
function sanitizeAddress(address) {
    if (address) {
        address.address1 = sanitizeString(address.address1);
        address.address2 = sanitizeString(address.address2);
        address.city = sanitizeString(address.city);
        address.firstName = sanitizeString(address.firstName);
        address.lastName = sanitizeString(address.lastName);
        address.postalCode = sanitizeString(address.postalCode);
        // Catch 9 digit zip codes without hyphen and format them correctly
        if (!empty(address.postalCode) && !empty(address.countryCode) && address.countryCode.value === 'US') {
            let postalCode = address.postalCode;
            if (postalCode.length === 9 && !postalCode.includes('-')) {
                address.postalCode = postalCode.substring(0, 5) + '-' + postalCode.substring(5);
                logHandler.logger.info({
                    message: 'BBWDP-44839 Formatting 9-digit zip code without hyphen old : ' + postalCode + ' new : ' + address.postalCode,
                }, 'OrderAddress', 'sanitizeAddress');
            }
        }
    }
}

module.exports = {
    isAddressValid,
    updateAddressWithRadialAddress,
    sanitizeString,
    sanitizeAddress
}
