const cryptography = require('app_composable/cartridge/scripts/helpers/util/cryptography.js');
const MailHelper = require('app_composable/cartridge/scripts/helpers/mail/mailHelper');
const errorHandler = require('app_composable/cartridge/scripts/helpers/util/errorHandler.js').errorHandler;

const Resource = require('dw/web/Resource');
const CustomerMgr = require('dw/customer/CustomerMgr');
const CustomObjectMgr = require('dw/object/CustomObjectMgr');
const Site = require('dw/system/Site').getCurrent();
const isLoyaltyEnabled = Site.getCustomPreferenceValue('bondLoyaltyEnabled');

/**
 * Decrypts email string and enables account login
 * @param {String} encryptedEmail - Encrypted email address
 * @returns {Object} Returns customer that has been updated
 */
function afterPasswordResetSuccess(encryptedEmail) {
    let key = Site.getCustomPreferenceValue('ResetPasswordSuccessEncryptionKey');
    let login = cryptography.decrypt(encryptedEmail, key);

    let resetCustomer = CustomerMgr.getCustomerByLogin(login);
    if (resetCustomer) {
        if (resetCustomer.profile.custom.mustChangePassword) {
            resetCustomer.profile.custom.mustChangePassword = false;
        }
    } else {
        throw new errorHandler.error('RESET-SUCCESS-04-003', { param: 'c_id' });
    }
    return resetCustomer;
}
/**
 * Finds related custom object and updates bond account and enables account login
 * @param {String} emailToken - Encrypted email address
 * @returns {Object} Returns customer that has been updated
 */
function afterPOSPasswordResetSuccess(emailToken) {
    let customObj = CustomObjectMgr.getCustomObject('POSPasswordResetRequests', emailToken);
    let login = customObj && customObj.custom.login || '';

    let resetCustomer = CustomerMgr.getCustomerByLogin(login);
    if (resetCustomer) {
        if(resetCustomer.profile.custom.mustChangePassword){
            resetCustomer.profile.custom.mustChangePassword = false;
        }
        if(isLoyaltyEnabled){
            const bondHelper = require('int_bond/cartridge/scripts/bond/helpers/bondHelper.js');
            bondHelper.updateBondLoyaltyAccount(resetCustomer, true);
        }
        if (customObj) {
            CustomObjectMgr.remove(customObj);
        }
    } else {
        throw new errorHandler.error('RESET-SUCCESS-04-003', { param: 'c_emailToken' });
    }
    return resetCustomer;
}

function sendPasswordChangedEmail(resetCustomer) {
    let toEmail = resetCustomer.profile.getEmail();
    let firstName = resetCustomer.profile.getFirstName();
    MailHelper.setRequestLocale();
    let subject = Resource.msg('passwordchanged.subject', 'mail', null);
    MailHelper.sendMailwRender('passwordchangedemail', toEmail, { firstName, subject });
}

module.exports = {
    afterPasswordResetSuccess,
    afterPOSPasswordResetSuccess,
    sendPasswordChangedEmail
}
