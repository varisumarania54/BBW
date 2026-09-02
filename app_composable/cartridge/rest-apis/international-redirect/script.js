'use strict'

const apiUtils = require('app_composable/cartridge/scripts/apiUtils.js');
const apiImplementation = require('app_composable/cartridge/scripts/apis/internationalRedirect.js').getInternationalRedirect
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;
const cacheTTLManager = require('app_composable/cartridge/scripts/helpers/util/cacheTTLManager.js');



exports.internationalRedirect = function () {
    try {
        cacheTTLManager.setResponseTTL();
        apiUtils.createResponse(200, apiImplementation());
    } catch (e) {
        logHandler.logger.error(e, 'CustomAPI', 'intRedirect');
        let httpCode = e.httpCode || 400;
        apiUtils.createError(httpCode, {
            title: e.name || 'Bad Request',
            type: e.type || 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/' + httpCode,
            detail: e.message
        });
    }
}

exports.internationalRedirect.public = true;