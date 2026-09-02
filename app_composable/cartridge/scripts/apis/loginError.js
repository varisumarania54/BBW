const CustomerMgr = require('dw/customer/CustomerMgr');
const StringUtils = require('dw/util/StringUtils');
const dataValidation = require('app_composable/cartridge/scripts/helpers/util/dataValidation.js').dataValidation;
const errorHandler = require('app_composable/cartridge/scripts/helpers/util/errorHandler.js').errorHandler;
const enableCIAMCheck = require('app_composable/cartridge/scripts/helpers/integrations/CIAM/enableCIAMCheck.js');


/**
 * Login Error API to check attempts and locked status
 * @function post
 * @memberof LoginError
 * @param {String} emailParam - email string
 * @return {Object} result of data locked status, attempts, status, and errors
 */
exports.post = function (emailParam) {
    let cust, profile, pcred, errorMsg, result = {'status': 400};

    enableCIAMCheck.enableCIAMCheck('CIAM-01-003');

    if (empty(emailParam)) {
        errorMsg = 'Empty Email Param';
    } else if (dataValidation.isValidEmail(emailParam)) {
        //check if email is valid and ensure customer exists prior to checking locked status and remaining attempts.
        cust = CustomerMgr.getCustomerByLogin(emailParam);
        if (!empty(cust)) {
            profile = cust.getProfile();

            if (!empty(profile)) {
                pcred = profile.getCredentials();
                result.remainingAttempts = !empty(pcred.remainingLoginAttempts) ? pcred.remainingLoginAttempts : '';
                result.isLocked = !empty(pcred.locked) ? pcred.locked : '';
                result.mustChangePW = !empty(profile.custom.mustChangePassword) ? profile.custom.mustChangePassword: false;
                result.status = 200;
            } else {
                errorMsg = StringUtils.format('Customer profile not found for {0}', emailParam);
            }
        } else {
            errorMsg = StringUtils.format('Customer not found for {0}', emailParam);
        }
    } else {
        errorMsg = StringUtils.format('Invalid Email Param {0}', emailParam);
    }

    //Generate new error for custom error and logging
    if (!empty(errorMsg)) {
        throw new errorHandler.newError('Login Error', errorMsg, result.status, 'loginError.js');
    }

    return result;
}
