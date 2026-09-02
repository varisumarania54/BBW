'use strict'

const apiUtils = require('app_composable/cartridge/scripts/apiUtils.js');
const apiImplementation = require('app_composable/cartridge/scripts/apis/loginError.js');
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;

/**
 * Login Error Messaging API to provide customer locked status and remaining attempts.
 * @namespace LoginError
 */
exports.loginError = function () {
    try {
        //var params = request.httpParameters;
        let requestBody = JSON.parse(request.httpParameterMap.requestBodyAsString);
        let c_email = !empty(requestBody) & !empty(requestBody.c_email) ? requestBody.c_email : '';
        let response = apiImplementation.post(c_email);

        apiUtils.createResponse(response.status, response);
    } catch (e) {
        let httpCode = e.httpCode || 500;
        apiUtils.createError(httpCode, {
            title: e.name || 'LoginErrorDefault',
            type: e.type || 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/' + httpCode,
            detail: e.message || 'An unexpected error occurred while processing the request.'
        });
        
        logHandler.logger.error(e, 'CustomAPI', 'loginError');
    }
};

exports.loginError.public = true;