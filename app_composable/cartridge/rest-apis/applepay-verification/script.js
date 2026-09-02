'use strict';

const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;

exports.applepayVerification = function () {
    var apiImplementation = require('app_composable/cartridge/scripts/apis/applepay.js');
    var apiUtils = require("app_composable/cartridge/scripts/apiUtils.js")
    try {
        var requestBody = JSON.parse(request.httpParameterMap.requestBodyAsString);
        var responses = apiImplementation.applepayVerification(requestBody);
        apiUtils.createResponse(200, responses);
    } catch (e) {
        logHandler.logger.error(e, 'CustomAPI', 'applePay');
        apiUtils.createError(400,'Bad Request');
    }
}
exports.applepayVerification.public = true;
