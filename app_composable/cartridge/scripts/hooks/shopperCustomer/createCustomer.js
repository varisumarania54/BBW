'use strict';

const Status = require('dw/system/Status');
const CustHelper = require('app_composable/cartridge/scripts/helpers/objects/customer');
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;
const recaptcha = require('app_composable/cartridge/scripts/helpers/recaptcha/recaptchaValidation');
const validationsUtil = require('app_composable/cartridge/scripts/helpers/util/validationsUtil.js');
const errorHandler = require('app_composable/cartridge/scripts/helpers/util/errorHandler').errorHandler;
const isLoyaltyEnabled = require('dw/system/Site').getCurrent().getCustomPreferenceValue('bondLoyaltyEnabled');
const SMSHelper = require('app_composable/cartridge/scripts/helpers/integrations/SMS/signUp.js');
const Site = require('dw/system/Site');
const smsMarketingOptinEnabled = Site.getCurrent().getCustomPreferenceValue('smsMarketingOptinEnabled');
const enableCIAMCheck = require('app_composable/cartridge/scripts/helpers/integrations/CIAM/enableCIAMCheck');

/**
 * Hook to validate the input field
 * @param {*} registration
 * @returns
 */
exports.beforePOST = function (registration: CustomerRegistration) {
    try {

        enableCIAMCheck.enableCIAMCheck('CIAM-01-002');

        const params = request.getHttpParameterMap();
        const clientSystem = params.isParameterSubmitted("c_client_system") ? params.get("c_client_system").getStringValue() : null;

        if (clientSystem && (clientSystem === 'mobile-app' || clientSystem === 'bond') || !request.isSCAPI()) {
            return new Status(Status.OK);
        }

        validationsUtil.validateRequest(registration, 'Customer-Attributes');

        const validationError = recaptcha.validateToken(recaptcha.ACCOUNT, recaptcha.CREATE_ACCOUNT);
        if (validationError) {
            logHandler.logger.error(validationError, 'Hooks', 'registerCustomer');
            return new Status(Status.ERROR, 'ERROR', validationError.message);
        }

        return new Status(Status.OK);
    } catch (e) {
        logHandler.logger.error(e, 'Hooks', 'createCustomer');
        return new Status(Status.ERROR, 'ERROR', e.message);
    }
}

/**
 * Hook to hash email after customer is created
 * @param {dw.customer.Customer} newCustomer
 * @param {CustomerRegistration} registration
 * @returns {Status}
 */
exports.afterPOST = function (newCustomer: dw.customer.Customer, registration: CustomerRegistration) {
    try {

        enableCIAMCheck.enableCIAMCheck('CIAM-01-002');

        if (!empty(newCustomer) && !empty(registration)) {
            const params = request.getHttpParameterMap();
            const clientSystem = params.isParameterSubmitted("c_client_system") ? params.get("c_client_system").getStringValue() : null;
            const c_smsMarketingOptIn = !empty(registration.customer.c_smsMarketingOptInFlag) ? registration.customer.c_smsMarketingOptInFlag : false;

            // Hash the email address to custom attribute of new customer
            // Passing new customer object because global 'customer' object would be guest customer at this point in registration
            CustHelper.hashEmail(newCustomer);
            
            // isLoyaltyEnabled flag enables or prevents adding new loyalty member for Canada
            // default behavior for web is there will be no client system param
            // create loyalty account only if request from scapi api and client system is not bond or app
            // loyalty account will be created if request is scapi and no client system param is present
            if (isLoyaltyEnabled && request.isSCAPI() && clientSystem !== 'bond' && clientSystem !== 'mobile-app') {
                let bondData = require('int_bond/cartridge/scripts/bond/helpers/bondHelper.js').addNewBondMember({customer: newCustomer});
                if (empty(bondData) || (!empty(bondData.status) && bondData.status === 'ERROR' || bondData.status === 'SERVICE_UNAVAILABLE') || empty(bondData.loyaltyId)) {
                    logHandler.logger.info(`Unable to create loyalty account for ${customer && customer.profile && customer.profile.email}`);
                } else {
                    const loyaltyHelper = require('app_composable/cartridge/scripts/helpers/loyalty/loyaltyHelper.js').loyaltyHelper;
                    loyaltyHelper.updateProfileWithBondData(newCustomer.profile, bondData);
                }
                
                if ((smsMarketingOptinEnabled != null ? smsMarketingOptinEnabled : false) && !empty(c_smsMarketingOptIn) && c_smsMarketingOptIn) {
                    let smsData = SMSHelper.SMSMarketService(newCustomer.profile);
                    if (empty(smsData)) {
                        newCustomer.profile.custom.smsMarketingOptIn = false;
                        logHandler.logger.info(`Unable to subscribe marketing sms account for ${newCustomer && newCustomer.profile ? newCustomer.profile.email + ' - ' + newCustomer.profile.phoneHome : ''}`);
                    } else if (!empty(newCustomer)) {
                        newCustomer.profile.custom.smsMarketingOptIn = true;
                    }
                }
            }
        }
        return new Status(Status.OK);
    }
    catch (e) {
        logHandler.logger.error(e, 'Hooks', 'createCustomer');
        return new Status(Status.ERROR, 'ERROR', e.message);
    }
}

/**
 * Hook to modify the response object
 * @param {dw.customer.Customer} newCustomer
 * @param {CustomerRegistration} registration
 * @returns {Status}
 */
exports.modifyPOSTResponse = function (newCustomer: dw.customer.Customer, registration: CustomerRegistration) {

    enableCIAMCheck.enableCIAMCheck('CIAM-01-002');
    validationsUtil.validateResponse(registration, 'Customer-Attributes');
    return new Status(Status.OK);
}
