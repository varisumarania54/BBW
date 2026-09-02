'use strict';

const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;
const paypalActions = ["GET", "SET"];
const paypalPages = ["cart", "billing"];
    exports.paypal = function (body) {
        const apiImplementation = require('app_composable/cartridge/scripts/apis/paypal.js');
        const apiUtils = require("app_composable/cartridge/scripts/apiUtils.js")
        try {
            const requestBody = JSON.parse(request.httpParameterMap.requestBodyAsString);
            if (paypalPages.some(e => e === requestBody.page_context) && paypalActions.some(e => e === requestBody.action)) {
                const response = apiImplementation.processPaypal(requestBody);
                if(response.ResponseCode === "Failure"){
                    let httpCode = 400;
                    apiUtils.createError(httpCode, {
                        title: 'PayPal API Error',
                        type: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/' + httpCode,
                        detail: response.ErrorMessage || 'An error occurred while processing the PayPal request.',
                    });
                }
                else{
                    apiUtils.createResponse(200, response);
                }
            }
            else{
                let httpCode = 400;
                apiUtils.createError(httpCode, {
                    title: 'Invalid Request',
                    type: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/' + httpCode,
                    detail: "page_context or action missing or invalid"
                });
            }
        } catch (e) {
            logHandler.logger.error(e, 'CustomAPI', 'expressPay');
            let httpCode = e.httpCode || 500;
            apiUtils.createError(httpCode, {
                title: e.name ||'Internal Server Error',
                type: e.type || 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/' + httpCode,
                detail: e.message || 'An unexpected error occurred while processing the request.'
            });
        }
    }
    exports.paypal.public = true;


