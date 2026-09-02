'use strict'

const apiUtils = require('app_composable/cartridge/scripts/apiUtils.js');
const apiImplementation = require('app_composable/cartridge/scripts/apis/onSession.js');
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;

/**
 * This SCAPI CUSTOM API endpoint is used to get the customers locations and stores
 * near his location. Also set those values in shopperContext
 */
exports.onSession = function () {
    try { 
        // Parse the request body 
        const requestBody = JSON.parse(request.httpParameterMap.requestBodyAsString);
        const response = apiImplementation.postOnSession(requestBody);
        apiUtils.createResponse(200, response);
    }
    catch (e){
        logHandler.logger.error(e, 'CustomAPI', 'onSession');
        let httpCode = e.httpCode || 500;
        apiUtils.createError(httpCode, {
            title: e.name || 'Server error',
            type: e.type || 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/' + httpCode,
            detail: e.message || 'An unexpected error occurred while processing the request.'
        });
    }
};

exports.onSession.public = true;