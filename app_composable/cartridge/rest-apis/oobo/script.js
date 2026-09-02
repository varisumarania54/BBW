'use strict';

const Logger = require('dw/system/Logger');
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;
const apiImplementation = require('app_composable/cartridge/scripts/apis/oobo.js');
const BasketMgr = require('dw/order/BasketMgr');
const apiUtils = require("app_composable/cartridge/scripts/apiUtils.js");
const aloudRoles = ['phone' , 'chat'];
const Site = require('dw/system/Site').getCurrent();

exports.startPCIPalSession = function (body) {
    try {
        const role = request.httpParameterMap.c_agentRole;
        const isRoleValid = !empty(role) && aloudRoles.some(e=>e === role.stringValue);
        if(session.userAuthenticated && (!Site.getCustomPreferenceValue('doOcapiChecksForPCIPAL') || session.custom.isSecurePayment) && isRoleValid){
            const basket = BasketMgr.getCurrentBasket();
            const responses = apiImplementation.startPCIPalSession(basket, role.stringValue);
            apiUtils.createResponse(200, responses);
        }
        else{
            if(!session.userAuthenticated || !session.custom.isSecurePayment){
                apiUtils.createError(401,'Unauthorized');
            }
            else if(!isRoleValid){
                apiUtils.createError(400,'Invalid Role');
            }
            else{
                apiUtils.createError(400,'Bad Request');
            }
        }
    } catch (e) {
        logHandler.logger.error(e, 'CustomAPI', 'oobo');
        let httpCode = e.httpCode || 500;
        apiUtils.createError(httpCode, {
            title: e.name || 'OOPS: Internal Server Error',
            type: e.type || 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/' + httpCode,
            detail: e.message
        });
    }
}
exports.startPCIPalSession.public = true;
