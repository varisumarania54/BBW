'use strict';

const Logger = require('dw/system/Logger');
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;
const apiImplementation = require('app_composable/cartridge/scripts/apis/processOrder.js');
const apiUtils = require("app_composable/cartridge/scripts/apiUtils.js");
const Site = require('dw/system/Site').getCurrent();

exports.processOrder = function (body) {
    try {
        const requestBody = JSON.parse(request.httpParameterMap.requestBodyAsString);
        //need to strip out radial prefix for processing order
        const orderNumber = requestBody.c_orderNumber.replace(Site.getCustomPreferenceValue('BBWOrderNumberPrefix'),'');
        const result = apiImplementation.validateAndGetOrder(orderNumber, requestBody.c_orderToken);
        if(!empty(result)) {
            if (request.locale !== result.customerLocaleID) {
                request.setLocale(result.customerLocaleID);
            }
            let status = apiImplementation.proccessOrder(result);
            if(status.OK){
                apiUtils.createResponse(200, status.message);
            }
            else{
                apiUtils.createError(200,status.message);
            }
        }
        else{
            apiUtils.createError(400,'Invalid Order');
        }
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
exports.processOrder.public = true;
