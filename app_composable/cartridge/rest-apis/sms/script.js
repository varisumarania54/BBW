'use strict'

const apiUtils = require('app_composable/cartridge/scripts/apiUtils.js');
const apiImplementation = require('app_composable/cartridge/scripts/apis/smsMarketing.js');
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;
const dataValidation = require('app_composable/cartridge/scripts/helpers/util/dataValidation.js').dataValidation;
const errorHandler = require('app_composable/cartridge/scripts/helpers/util/errorHandler.js').errorHandler;

/**
 * This SCAPI CUSTOM API endpoint is used to register customer sms optin marketing texts
 */
exports.marketingOptin = function () {
    try {
        let requestBody = JSON.parse(request.httpParameterMap.requestBodyAsString);
        let phone = !empty(requestBody) & !empty(requestBody.c_phone) ? requestBody.c_phone : '';
        let email = !empty(requestBody) & !empty(requestBody.c_email) ? requestBody.c_email : '';

        let response = apiImplementation.post({phone, email});

        apiUtils.createResponse(response.status, response);
    } catch (e) {
        let httpCode = e.httpCode || 500;
        apiUtils.createError(httpCode, {
            title: e.name || 'SMSMarketingDefault',
            type: e.type || 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/' + httpCode,
            detail: e.message || 'An unexpected error occurred while processing the request.'
        });
        logHandler.logger.error(e, 'CustomAPI', 'SmsMarketing');
    }
};

exports.marketingOptin.public = true;
