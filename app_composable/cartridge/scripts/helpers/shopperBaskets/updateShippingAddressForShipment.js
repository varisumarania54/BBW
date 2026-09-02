'use strict';
/**
 * @module updateShippingAddressForShipment
 */
const Site = require('dw/system/Site').getCurrent();
const Status = require('dw/system/Status');
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;

/**
 * Determines if the passed in address is valid based on bbw business rules
 * @function isAddressAllowed
 * @memberof updateShippingAddressForShipment
 * @param {dw.order.OrderAddress} shippingAddress
 * @return {dw.system.Status | null }
 */
function isAddressAllowed(shippingAddress){
    const allowedCountries = Site.getCustomPreferenceValue('allowedShippingAddressCountryCodes');
    if(!empty(allowedCountries)){
        const countryCode = shippingAddress.countryCode.toUpperCase();
        if(!allowedCountries.includes(countryCode)){
            return new Status(Status.ERROR, "400", "Invalid country");
        }
    }
    return null;
}

/**
 * Validates whether a given postal code is valid for the specified state code based on a predefined postal code table.
 * Retrieves the postal code table from site preferences and checks if the postal code starts with any allowed prefixes for the state.
 *
 * @param {string} postalCode - The postal code to be validated.
 * @param {string} stateCode - The state code against which the postal code is validated.
 * @return {boolean} Returns true if the postal code is valid for the given state code or if no restrictions exist,
 *                   otherwise returns false.
 */
function isPostalCodeValid(postalCode, stateCode) {
    let postalCodeTableJSON = Site.getCustomPreferenceValue('postalCodeTable');
    let postalCodeTable;

    try {
        postalCodeTable = postalCodeTableJSON ? JSON.parse(postalCodeTableJSON) : null;
        if (postalCodeTable && postalCode && stateCode && postalCodeTable[stateCode]) {
            return postalCodeTable[stateCode].filter((key) => key === postalCode.charAt(0)).length > 0;
        }
    } catch (error) {
        logHandler.logger.error(error, 'CustomAPI', 'ValidatePostalCode');

    }

    return true;
}


module.exports = {
    isAddressAllowed,
    isPostalCodeValid
}
