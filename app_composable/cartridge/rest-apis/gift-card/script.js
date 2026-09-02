'use strict';

var Logger = require('dw/system/Logger');

exports.balance = function () {
    var apiImplementation = require('app_composable/cartridge/scripts/apis/giftcard.js');
    var apiUtils = require("app_composable/cartridge/scripts/apiUtils.js")
    try {
        apiUtils.createResponse(200, { giftcard: apiImplementation.getBalance()});
    } catch (e) {
        Logger.error('gift-card script.js:' + e);
        let httpCode = e.httpCode || 500;
        apiUtils.createError(httpCode, {
            title: e.name || 'OOPS: Internal Server Error',
            type: e.type || 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/' + httpCode,
            detail: e.message
        });
    }
}
exports.balance.public = true;
