'use strict';
const Status = require("dw/system/Status");
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;
const Resource = require("dw/web/Resource");
const MailHelper = require('app_composable/cartridge/scripts/helpers/mail/mailHelper');
const CustomerMgr = require('dw/customer/CustomerMgr');
const dataValidation = require('app_composable/cartridge/scripts/helpers/util/dataValidation.js').dataValidation;
const CustHelper = require('app_composable/cartridge/scripts/helpers/objects/customer');
const validationsUtil = require('app_composable/cartridge/scripts/helpers/util/validationsUtil.js');
const errorHandler = require('app_composable/cartridge/scripts/helpers/util/errorHandler.js').errorHandler;
const Site = require('dw/system/Site').getCurrent();
const orderGrooveEnabled = Site.getCustomPreferenceValue('OrderGrooveEnable');
const isLoyaltyEnabled = Site.getCustomPreferenceValue('bondLoyaltyEnabled');
const bondHelper = isLoyaltyEnabled ? require('int_bond/cartridge/scripts/bond/helpers/bondHelper.js') : {};
const sitePrefHelper = require('app_composable/cartridge/scripts/helpers/util/sitePrefHelper');
const isCIAMEnable = sitePrefHelper.getSitePrefValue('enableCIAM');
const enableCIAMCheck = require('app_composable/cartridge/scripts/helpers/integrations/CIAM/enableCIAMCheck.js');

/**
 * Hook to validate CIAM flag.
 * @param {customer} customer
 * @param {Object | null} customerInput
 * @returns
 */
exports.beforePUT = function (customer: dw.customer.Customer) {
    try {
        enableCIAMCheck.enableCIAMCheck('CIAM-01-005');
    } catch (e) {
        logHandler.logger.error(e, 'Hooks', 'updateCustomer');
        return new Status(Status.ERROR, 'ERROR', e.message);
    }
}

/**
 * Hook to validate customer password, payload before making update customer API call.
 * @param {customer} customer
 * @param {Object | null} customerInput
 * @returns
 */
exports.beforePATCH = function (customer: dw.customer.Customer, customerInput) {
    try {
        if (CustHelper.exists() && !empty(customerInput)) {
            if (customer.isAuthenticated() && CustHelper.hasProfile()) {

                if (isCIAMEnable) {
                    validationsUtil.validateCIAMattributes(customerInput);
                }

                validationsUtil.validateRequest(customerInput, 'Customer-Attributes');

                // customer already has birthday set, trying to change birthday again - throw error
                if (customerInput.birthday && customer.profile.birthday) {
                    throw new errorHandler.error('VALIDATE-FIELD-04-004');
                }
                // email and login are matching
                if (customerInput.email !== customerInput.login) {
                    throw new errorHandler.error('VALIDATE-FIELD-04-005');
                }

                // Check the input request if customer is currently in signup process for Loyalty
                // If CIAM is enabled, skip loyalty signup during customer update
                if (!isCIAMEnable) {
                    if (isLoyaltyEnabled && customerInput.c_loyaltySignup) {
                        let bondData = bondHelper.addNewBondMember({customer: customer});
                        if (empty(bondData) || (!empty(bondData.status) && bondData.status === 'ERROR' || bondData.status === 'SERVICE_UNAVAILABLE') || empty(bondData.loyaltyId)) {
                            logHandler.logger.info(`Unable to create loyalty account for ${customer && customer.profile && customer.profile.email}`);
                        } else {
                            let loyaltyHelper = require('app_composable/cartridge/scripts/helpers/loyalty/loyaltyHelper.js').loyaltyHelper;
                            loyaltyHelper.updateProfileWithBondData(customer.profile, bondData);
                        }
                    }
                } else {
                    enableCIAMCheck.enableCIAMCheck('CIAM-01-001')
                }
            } else {
                throw new errorHandler.error('VALIDATE-FIELD-04-008');
            }
        }
        return new Status(Status.OK);
    }
    catch (e) {
        logHandler.logger.error(e, 'Hooks', 'updateCustomer');
        return new Status(Status.ERROR, 'ERROR', e.message);
    }
}

/**
 * Hook to send email, hash email, update order groove and bond after customer info is updated.
 * @param {customer} customer
 * @param {Object | null} customerInput
 * @returns
 */
exports.afterPATCH = function (customer: dw.customer.Customer, customerInput) {
    try {
        if (CustHelper.exists() && !empty(customerInput)) {
            // update order groove and bond only when customerInput payload contains firstName/lastName/email
            const validAttrsForUpdatingBondAndOG = ['firstName', 'lastName', 'email'].some(attr => customerInput[attr]);
            if (orderGrooveEnabled && validAttrsForUpdatingBondAndOG) {
                const orderGrooveCustomerUpdate = require('int_ordergroove/cartridge/scripts/customerUpdate.js');
                orderGrooveCustomerUpdate.sync(customer.profile);
            }
            // check if user is loyalty user, update bond
            if (isLoyaltyEnabled && !empty(customer.profile.custom) && !empty(customer.profile.custom.loyaltyID) && validAttrsForUpdatingBondAndOG) {
                bondHelper.updateBondLoyaltyAccount(customer, false);
            }
        } else {
            throw new errorHandler.error('VALIDATE-FIELD-04-008');
        }

        // One Trust DNSR
        if (customerInput.c_submitOneTrustDNS === true && customer.profile.custom.isOneTrustDNSReqSubmitted !== true) {
            require('app_composable/cartridge/scripts/helpers/oneTrust/oneTrustHelper').submitDNSR();
        }

        return new Status(Status.OK);
    }
    catch (e) {
        logHandler.logger.error(e, 'Hooks', 'updateCustomer');
        return new Status(Status.ERROR, 'ERROR', e.message);
    }
}

/**
 * Hook to modify patch response to send only required information to FE
 * @param {customer} customer
 * @param {Object} customerResponse
 * @returns
 */
exports.modifyPATCHResponse = function (customer: dw.customer.Customer, customerResponse: Customer) {
    try {
        if (CustHelper.exists() && customer.isAuthenticated() && !empty(customerResponse)) {
            validationsUtil.validateResponse(customerResponse, 'Customer-Attributes');
        } else {
            throw new errorHandler.error('VALIDATE-FIELD-04-008');
        }

        return new Status(Status.OK);
    }
    catch (e) {
        logHandler.logger.error(e, 'Hooks', 'updateCustomer');
        return new Status(Status.ERROR, 'ERROR', e.message);
    }
}

/**
 * Hook to validate customer Password, send email after password update for update customer password API
 * @param {*} customer
 * @param {*} passwordChangeRequest
 * @returns
 */
exports.afterPUT_v2 = function (customer: dw.customer.Customer, passwordChangeRequest: PasswordChangeRequestWO) {
    try {
        if (CustHelper.hasProfile() && customer.authenticated) {
            const currentCreds = customer.profile.getCredentials();
            // validate password against password rules
            const isValidPassword = dataValidation.isValidPassword(passwordChangeRequest.password);
            if (isValidPassword) {
                // newPass, oldPass, verify old pass
                const setPassword = currentCreds.setPassword(passwordChangeRequest.password, passwordChangeRequest.currentPassword, true);
                if (!setPassword) {
                    throw new Error('Password Update Failed');
                }
                if (setPassword && Site.getCustomPreferenceValue('sendPasswordUpdateEmail')) {
                    // send an email to user telling the password is changed.
                    const toEmail = customer.profile.email;
                    const firstName = customer.profile.firstName;
                    MailHelper.setRequestLocale();
                    MailHelper.sendMailwRender('passwordchangedemail', toEmail, { firstName, subject: Resource.msg('passwordchanged.passwordassistance', 'mail', null) });
                }
            } else {
                throw new Error('Invalid Password');
            }
        } else {
            throw new Error('Customer is not authenticated');
        }
        return new Status(Status.OK);
    }
    catch (e) {
        logHandler.logger.error(e, 'Hooks', 'updateCustomer');
        return new Status(Status.ERROR, 'ERROR', e.message);
    }
}
