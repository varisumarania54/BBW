'use strict'

const apiUtils = require('app_composable/cartridge/scripts/apiUtils.js');
const apiImplementation = require('app_composable/cartridge/scripts/apis/aurusSession.js');
const Status = require('dw/system/Status');
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;

/**
 * This SCAPI CUSTOM API endpoint is used to handle Aurus payment session operations
 */
exports.aurusSession = function () {
    try {
        const response = apiImplementation.postAurusSession();
        apiUtils.createResponse(200, response);
    }
    catch (e){
        logHandler.logger.error(e, 'CustomAPI', 'aurusSession');
        apiUtils.createError(e.httpCode || 500, {
            title: e.name || 'Server error',
            type: e.type || 'https://custom.api.commercecloud.salesforce.com/documentation/error/v1/custom/aurus-session/server-error',
            detail: e.message
        });
    }
};

exports.aurusSession.public = true;
