'use strict'

const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;

/**
 * @typedef {object} RFC7807Error
 * @property {string} type
 * @property {string} title
 * @property {string} [detail]
 * @property {string} [instance]
 */

/**
 * @param {number} statusCode the http status code
 * @param {RFC7807Error} error the errordetails to expose
 */
exports.createError = function createError(statusCode, error) {
    response.setStatus(statusCode);
    response.setContentType('application/problem+json');
    response.getWriter().println(JSON.stringify(error));
};

/**
 * createErrorResponse: Generate the error response for API based on error object.
 * @function createErrorResponse
 * @memberof ApiUtil
 * @param {Object} error - custom error object
 */
exports.createErrorResponse = function createErrorResponse(error) {
    //if this is not a defined error then httpCode will not be present
    if (empty(error.httpCode)) {
        logHandler.logger.error(error, 'CustomAPI', 'UndefinedError');
        error.httpCode = 500;
        error.error_code = "Custom API Internal Server Error";
        error.message = "Check log file for error details";
    }

     response.setStatus(error.httpCode);
     response.setContentType('application/problem+json');
     response.getWriter().println(JSON.stringify({
         title: error.error_code ,
         type: 'https://custom.api.commercecloud.salesforce.com/documentation/error/v1/custom/product-extend/server-error',
         detail: error.message
     }));
};

/**
 * writes a stringified object to the response object
 * @param {number} statusCode the http status code
 * @param {Object} object the object to send out to the client
 */
exports.createResponse = function createResponse(statusCode, object) {
    response.setStatus(statusCode);
    response.setContentType('application/json');
    response.getWriter().println(JSON.stringify(object));
};

/**
 * Handles Remote include response properly
 * @param {Object} object the object from remote include
 */
exports.remoteIncludeResponse = function remoteIncludeResponse(object) {
    dw.system.RESTResponseMgr.createSuccess(object).render();
};

/**
 * Parses the JSON body from the HTTP request.
 * @return {Object|null} The parsed JSON object if parsing is successful, otherwise null.
 */
exports.getJSONReqBody = function getJSONReqBody() {
    try {
        return JSON.parse(request.httpParameterMap.requestBodyAsString);
    } catch (e) {
        logHandler.logger.error('Error parsing Request Body JSON string: ' + e.message + '\n' + e.stack);
        return null;
    }
};
