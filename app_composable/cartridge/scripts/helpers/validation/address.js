'use strict';


const address = {

    /**
     * Check that a given address object contains valid address values
     * @function isValidAddress
     * @param {Object} address
     * @returns {Array} An array of address field string names that failed validation. An empty array means the address passed validation.
     */
    isValidAddress: function(address) {
        let failedFields = [];
        const validationsUtil = require('app_composable/cartridge/scripts/helpers/util/validationsUtil.js');

        // Validate first name
        if (!empty(address.firstName) && !validationsUtil.validateField('firstName', address.firstName)) {
            failedFields.push('firstName');
        }

        // Validate last name
        if (!validationsUtil.validateField('lastName', address.lastName)) {
            failedFields.push('lastName');
        }

        // Validate address1
        if (!empty(address.address1) && !validationsUtil.validateField('address1', address.address1)) {
            failedFields.push('address1');
        }

        // Validate address2
        if (!empty(address.address2) && !validationsUtil.validateField('address2', address.address2)) {
            failedFields.push('address2');
        }

        // Validate city
        if (!empty(address.city) && !validationsUtil.validateField('city', address.city)) {
            failedFields.push('city');
        }

        if (!empty(address.countryCode) && !validationsUtil.validateField('countryCode', address.countryCode, address.countryCode)) {
            failedFields.push('countryCode');
            failedFields.push('stateCode');
        } else if  (!empty(address.stateCode) && !validationsUtil.validateField('stateCode', address.stateCode, address.countryCode)){
            failedFields.push('stateCode');
        }

        // Validate postal code
        if (!empty(address.postalCode) && !validationsUtil.validateField('postalCode', address.postalCode, address.countryCode)) {
            failedFields.push('postalCode');
        }

        // Validate phone number
        if (!empty(address.phone) && !validationsUtil.validateField('phone', address.phone)) {
            failedFields.push('phone');
        }

        return failedFields;
    }
}

exports.address = address;
