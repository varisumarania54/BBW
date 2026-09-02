'use strict';

const Logger = require('dw/system/Logger');
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;

exports.getbaskettransaction = function (body) {
    const apiImplementation = require('app_composable/cartridge/scripts/apis/getBasketTransaction.js');
    const apiUtils = require("app_composable/cartridge/scripts/apiUtils.js");
    const requestBody = apiUtils.getJSONReqBody() || {};

    try {
        const responses = apiImplementation.basketTransaction(requestBody);
        apiUtils.remoteIncludeResponse(responses);
    } catch (e) {
        logHandler.logger.error(e, 'CustomAPI', 'basket-t');
        let httpCode = e.httpCode || 500;
        apiUtils.createError(httpCode, {
            title: e.name || 'OOPS: Internal Server Error',
            type: e.type || 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/' + httpCode,
            detail: e.message
        });
    }
}

exports.getbaskettransaction.public = true;
