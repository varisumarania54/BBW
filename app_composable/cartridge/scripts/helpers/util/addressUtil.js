'use strict';
const Site = require('dw/system/Site').getCurrent();
const logger = require("app_composable/cartridge/scripts/helpers/util/logHandler.js").logHandler.logger;

/**
 * Generate address name based on the full address object
 * @function generateAddressName
 * @memberof AddressUtil
 * @param {dw.order.OrderAddress} address - Object that contains shipping address
 * @returns {string} - String with the generated address name
 */
function generateAddressName(address) {
    return [(address.address1 || ''), (address.city || ''), (address.postalCode || '')].join(' - ');
}

/**
 * Verify if the address already exists as a stored user address
 * @param {dw.order.OrderAddress} address - Object that contains shipping address
 * @param {Object[]} storedAddresses - List of stored user addresses
 * @returns {boolean} - Boolean indicating if the address already exists
 */
function checkIfAddressStored(address, storedAddresses) {
    // Return false immediately if there are no stored addresses to check against
    if (storedAddresses.length === 0) {
        return false;
    }

    // Iterate through each stored address
    for (var i = 0, l = storedAddresses.length; i < l; i++) {
        // Check if all relevant fields match between the current stored address and the provided address
        if (storedAddresses[i].address1 === address.address1 &&
            storedAddresses[i].postalCode === address.postalCode &&
            storedAddresses[i].city === address.city &&
            storedAddresses[i].firstName === address.firstName &&
            storedAddresses[i].lastName === address.lastName) {
            // If a match is found, return true
            return true;
        }
    }

    // If no matches are found, return false
    return false;
}

/**
 * Save address to customer address book and before add check if address exist
 * @function saveAddressToCustomerAddressBook
 * @memberof AddressUtil
 * @param {dw.order.OrderAddress} address - Object that contains shipping address
 * @param {dw.customer.Customer} customerData - Current customer
 * @returns {boolean} - Boolean indicating if the address is saved
 */
function saveAddressToCustomerAddressBook(address, customerData) {

        // Generate address name based on the full address object
    var addressId = generateAddressName(address);
    // Get the address book from the customer profile
    let addressBook = customerData.getProfile().getAddressBook();

    // Check if the address already exists in the customer's address book
    // If it does, return true as nothing needs to be saved
    if (addressBook.getAddress(addressId)) {
        return true;
    }

    // Check if the address already exists in the customer's address book
    // If it does, return false as nothing needs to be saved
    if (checkIfAddressStored(address, addressBook.getAddresses())) {
        return false;
    }
    // Create a new address in the customer's address book
    // and populate it with the provided address data
    var newAddress = addressBook.createAddress(addressId);
    newAddress.setCity(address.city);
    newAddress.setFirstName(address.firstName);
    newAddress.setLastName(address.lastName);
    newAddress.setAddress1(address.address1);
    newAddress.setAddress2(address.address2);
    newAddress.setPostalCode(address.postalCode);
    newAddress.setStateCode(address.stateCode);
    newAddress.setCountryCode(address.countryCode);
    newAddress.setPhone(address.phone);
    // Return true to indicate that the address was saved
    return true;
}


/**
 * Remove potential emojis from shipping method feilds
 * @param {*} address
 */
function removeEmojisFromAddress(address){
    try{
        if(empty(address)){
            return address;
        }
        const shippingKeys = Object.keys(address);
        const parentRegex = JSON.parse(Site.getCustomPreferenceValue("fieldRegexValue"));
        const emojiRegex = !empty(parentRegex) && !empty(parentRegex.emojiRegex) ? new RegExp(parentRegex.emojiRegex) : null
        if(!empty(emojiRegex)){
            shippingKeys.forEach(key=>{
                var addressInput = address[key];
                if(typeof addressInput == "string" && !empty(addressInput)){
                    address[key] = addressInput.replace(emojiRegex,'');
                }
            })
        }
        return address;
    }catch(e){
        logger.info(e, 'CustomAPI', 'RemoveEmojis');
        return address;
    }
}

/**
 *
 * @param {*} basket
 * @param {*} address
 */
function updateBillingAddressWithShippingAddress(basket,address){

    let billingAddress = basket.billingAddress;
        if (!billingAddress) {
            billingAddress = basket.createBillingAddress();
        }
        billingAddress.setFirstName(address.firstName);
        billingAddress.setLastName(address.lastName);
        billingAddress.setAddress1(address.address1);
        billingAddress.setAddress2(address.address2);
        billingAddress.setCity(address.city);
        billingAddress.setPostalCode(address.postalCode);
        billingAddress.setStateCode(address.stateCode);
        billingAddress.setCountryCode(address.countryCode);
        billingAddress.setPhone(address.phone);
}

module.exports = {
    saveAddressToCustomerAddressBook: saveAddressToCustomerAddressBook,
    generateAddressName: generateAddressName,
    checkIfAddressStored: checkIfAddressStored,
    removeEmojisFromAddress: removeEmojisFromAddress,
    updateBillingAddressWithShippingAddress: updateBillingAddressWithShippingAddress
};
