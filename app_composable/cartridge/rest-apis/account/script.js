'use strict'

const apiUtils = require('app_composable/cartridge/scripts/apiUtils');
const apiImplementation = require('app_composable/cartridge/scripts/apis/account');
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler').logHandler;
const dataValidation = require('app_composable/cartridge/scripts/helpers/util/dataValidation').dataValidation;
const errorHandler = require('app_composable/cartridge/scripts/helpers/util/errorHandler').errorHandler;
const recaptcha = require('app_composable/cartridge/scripts/helpers/recaptcha/recaptchaValidation');
const enableCIAMCheck = require('app_composable/cartridge/scripts/helpers/integrations/CIAM/enableCIAMCheck');

/**
 * Custom API to check if an account already exists for a given email
 */
exports.checkAccount = function () {
    try {
        enableCIAMCheck.enableCIAMCheck('CIAM-01-001');

        const validationError = recaptcha.validateToken(recaptcha.ACCOUNT, recaptcha.CHECK_ACCOUNT);
        if (validationError) {
            throw validationError;
        }

        const params = request.getHttpParameterMap();
        const email = params.get('c_email').getStringValue();
        const response = apiImplementation.get.checkAccount(email);
        apiUtils.createResponse(200, response);
    } catch (e) {
        let httpCode = e.httpCode || 500;
        apiUtils.createError(httpCode, {
            title: e.name || 'check Account API',
            type: e.type || 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/' + httpCode,
            detail: e.message || 'An unexpected error occurred while processing the request.'
        });
        logHandler.logger.error(e, 'CustomAPI', 'checkAccount');
    }
}

exports.checkAccount.public = true;

exports.getAccountInfo = function () {
    try {
        const params = request.getHttpParameterMap();
        const emailToken = params.get('c_emailToken').getStringValue();
        const accountResponse = apiImplementation.get.getAccountInfo(emailToken);
        apiUtils.createResponse(200, accountResponse);
    } catch (error) {
        logHandler.logger.error(error, 'CustomAPI', 'getAccountInfo');
        let httpCode = error.httpCode || 500;
        apiUtils.createError(httpCode, {
            title: error.name || 'Server error',
            type: error.type || 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/' + httpCode,
            detail: error.message || 'An unexpected error occurred while processing the request.'
        });
    }
};

exports.getAccountInfo.public = true;
