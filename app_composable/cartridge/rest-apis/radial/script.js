'use strict'

const apiUtils = require('app_composable/cartridge/scripts/apiUtils.js');
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;
const radialService = require('app_composable/cartridge/scripts/services/Radial.js');
const tokenManager = require('int_radial_composable/cartridge/scripts/jobs/radialTokenManager.js');
/**
 * This SCAPI CUSTOM API endpoint is used to get Radial JWT token for iframe
 */
exports.iframeToken = function () {
    try {

        let result = tokenManager.getCurrentToken();

        let statusCode = 200;
        let resultObject = result;
        if (!result || !result.access_token) {
            statusCode = 400;
            try {
                resultObject = JSON.parse(result.errorMessage);
            } catch (e) {
                logHandler.logger.error(e, 'CustomAPI', 'radialIframeToken');
            }
        }

        apiUtils.createResponse(statusCode, resultObject);

    } catch (e) {
        let httpCode = e.httpCode || 500;
        apiUtils.createError(httpCode, {
            title: e.name || 'radialIframeToken',
            type: e.type || 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/' + httpCode,
            detail: e.message || 'An unexpected error occurred while processing the request.'
        });

        logHandler.logger.error(e, 'CustomAPI', 'radialIframeToken');
    }
};

exports.iframeToken.public = true;
