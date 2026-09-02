'use strict'

const cryptography = require('app_composable/cartridge/scripts/helpers/util/cryptography');
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;

/**
 * A namespace.
 * @namespace Customer
 */

/**
 * Checks customer existence
 * @function exists
 * @memberof Customer
 * @returns {boolean} existence check
 */
function exists() {
    return !empty(customer);
}

/**
 * Checks customer profile existence
 * @function hasProfile
 * @memberof Customer
 * @returns {Boolean} existence check
 */
function hasProfile() {
    return exists() && !empty(customer.profile);
}

/**
 * Gets customer profile data while checking existence
 * @function getProfileData
 * @memberof Customer
 * @returns {Object | null} customer profile or null
 */
function getProfileData() {
    return hasProfile() ? customer.profile : null;
}

/**
 * Hashes (SHA256) a customer profile's email address into a custom attribute: emailHash
 * @function hashEmail
 * @memberof Customer
 * @param {Customer} customer object
 */
function hashEmail(customer) {
    if (customer.registered) {
        try {
            customer.profile.custom.emailHash = cryptography.hash(customer.profile.email.toLowerCase());
        } catch (error) {
            logHandler.logger.error(error, 'Profile', 'hashEmail');
        }
    }
}

/**
 * Updates the customer profile's custom fields bopisPreferredStoreName and bopisPreferredStoreID with the passed in data
 * @function updatePreferredStoreOnProfile
 * @memberof Customer
 * @param {dw.customer.Profile} profile- The profile to update
 * @param {String} storeName- The name of the store
 * @param {String} storeId - The id of the store
 */

function updatePreferredStoreOnProfile (store){
    const profile = getProfileData();
    if((!empty(profile)) && (profile.custom.bopisPreferredStoreID !== store.ID)){
        profile.custom.bopisPreferredStoreID = store.ID
        profile.custom.bopisPreferredStoreName = store.name
        return true;
    }
return false;
}

/**
 * Gets the preferred store from the past in profile
 * @function getPreferredStoreOnProfile
 * @memberof Customer
 * @param {dw.customer.Profile} profile- The profile to update
 * @return {Object | null} {profile.custom.bopisPreferredStoreName , profile.custom.bopisPreferredStoreID}
 */
function getPreferredStoreOnProfile(profile){
    return {
        'bopisPreferredStoreID':!empty(profile.custom.bopisPreferredStoreID)? profile.custom.bopisPreferredStoreID:null,
        'bopisPreferredStoreName':!empty(profile.custom.bopisPreferredStoreName) ? profile.custom.bopisPreferredStoreName:null
    }
}

/**
 * Checks if customer has saved address
 * @function isSavedAddress
 * @memberof Customer
 * @returns {boolean} existence check
 */
function isSavedAddress(billingAddressId) {
    return hasProfile() && !empty(billingAddressId) ? !empty(customer.profile.getAddressBook().getAddress(billingAddressId)) : false;
}

/**
 * Gets customer wallet payment instruments as array
 * @function getPIList
 * @memberof Customer
 * @returns {Object | null} array of customer payment instruments or null
 */
function getPIList() {
    return hasProfile() ? customer.profile.wallet.getPaymentInstruments().toArray() : [];
}

/**
 * Checks payment instrument existence
 * @function exists
 * @memberof Customer
 * @returns {boolean} existence check
 */
function piExists(paymentInstrumentUUID) {
   return !empty(paymentInstrumentUUID) ? getPIList().some(pi => pi.UUID === paymentInstrumentUUID) : false;
}

/**
* Checks if payment instrument is saved and also returns payment instrument data
* @function getExistingPIData
* @memberof Customer
* @param {string} paymentInstrumentUUID string id of the payment instrument
* @returns {Object | null} return payment instrument if found
*/
function getExistingPIData(paymentInstrumentUUID) {
   return !empty(paymentInstrumentUUID) ? getPIList().find(pi => pi.UUID === paymentInstrumentUUID) : null;
}

/**
* Checks if payment instrument is default card, while also checking if payment instruemnt is part of customer wallet
* @function isDefaultCard
* @memberof Customer
* @param {string} paymentInstrumentUUID string id of the payment instrument
* @returns {Boolean} array of customer payment instruments 
*/
function isDefaultCard(paymentInstrumentUUID) {
   let piData = getExistingPIData(paymentInstrumentUUID);
   return !empty(piData) && !empty(piData.custom) && piData.custom.DefaultCard ? piData.custom.DefaultCard : false;
}

/**
* Sets customer default payment instrument so long as the payment instrument id is in cusatomer wallet
* @function setDefaultCard
* @memberof Customer
* @returns {Boolean} successful default card change
*/
function setDefaultCard(paymentInstrumentUUID) {

    let updated = false;
    let paymentInstruments = getPIList();

    paymentInstruments.forEach(pi => {
        let match = (pi.UUID === paymentInstrumentUUID);
        pi.custom.DefaultCard = match;
        if (match){
            updated = true;
        }
    });
   
   return updated;
}

module.exports = {
    exists,
    hasProfile,
    getProfileData,
    hashEmail,
    getPreferredStoreOnProfile,
    updatePreferredStoreOnProfile,
    isSavedAddress,
    getPIList,
    piExists,
    getExistingPIData,
    isDefaultCard,
    setDefaultCard
}