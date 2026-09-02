'use strict';
/**
 * @namespace SMS
 */
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;
const SMSServiceHelper = require('app_composable/cartridge/scripts/services/SMS.js');

/**
 * Sign up the user for sms updates on there order
 * @function SMSService
 * @memberof SMS
 * @param {Order} order - The order the user is signing up for
 */

function SMSService(order) {
    try {
        let requestObj = SMSServiceHelper.SMSRequestObject(order),
            service = SMSServiceHelper.SMSRequest(),
            response = service.call(requestObj);
        if (!empty(response) && response.ok) {
            logHandler.logger.info({message : 'SMSoptin Message Sent Successfully : '+ requestObj.ordernumber}, 'SMS', 'Signup');
            return response.object;
        } else {
            let code = response.error;
            if (code === 401) {
                logHandler.logger.error({message : 'Authentication failed for : '+ requestObj.ordernumber}, 'SMS', 'Signup');
            } else if (code === 503) {
                logHandler.logger.error({message : 'Service Unavailable for : '+ requestObj.ordernumber}, 'SMS', 'Signup');
            } else if (code === 405) {
                logHandler.logger.error({message : 'Method Not Allowed for : '+ requestObj.ordernumber}, 'SMS', 'Signup');
            } else if (code === 404) {
                logHandler.logger.error({message : 'Resource Not Found : '+ requestObj.ordernumber}, 'SMS', 'Signup');
            } else if (code === 502) {
                logHandler.logger.error({message : 'Bad Gateway : '+ requestObj.ordernumber}, 'SMS', 'Signup');
            } else if (code === 504) {
                logHandler.logger.error({message : 'Gateway Timeout for : '+ requestObj.ordernumber}, 'SMS', 'Signup');
            } else if (code === 500) {
                logHandler.logger.error({message : 'Internal Server Error : '+ requestObj.ordernumber}, 'SMS', 'Signup');
            } else {
                logHandler.logger.error({message : 'Unable to get SMS service, error occurs during call: '+ requestObj.ordernumber}, 'SMS', 'Signup');
            }
        }
    } catch (e) {
        logHandler.logger.error(e, 'SMS', 'Signup');
    }

}

/**
 * Sign up the user for marketing sms updates
 * @function SMSMarketService
 * @memberof SMS
 * @param {Object} custData - The order the user is signing up for
 */

function SMSMarketService(custData) {
    try {
        let requestObj = SMSServiceHelper.SMSMarketRequestObject(custData),
            service = SMSServiceHelper.SMSMarketRequest(),
            response = service.call(requestObj);
        if (!empty(response) && response.ok) {
            logHandler.logger.info({message : 'SMSmarketoptin Message Sent Successfully : '+ requestObj.user.phone + ' - ' + requestObj.user.email}, 'SMS', 'Signup');
            return response.object;
        } else {
            let code = response.error;
            if (code === 401) {
                logHandler.logger.error({message : 'Authentication failed for : '+ requestObj.user.phone + ' - ' + requestObj.user.email}, 'SMS', 'Signup');
            } else if (code === 503) {
                logHandler.logger.error({message : 'Service Unavailable for : '+ requestObj.user.phone + ' - ' + requestObj.user.email}, 'SMS', 'Signup');
            } else if (code === 405) {
                logHandler.logger.error({message : 'Method Not Allowed for : '+ requestObj.user.phone + ' - ' + requestObj.user.email}, 'SMS', 'Signup');
            } else if (code === 404) {
                logHandler.logger.error({message : 'Resource Not Found : '+ requestObj.user.phone + ' - ' + requestObj.user.email}, 'SMS', 'Signup');
            } else if (code === 502) {
                logHandler.logger.error({message : 'Bad Gateway : '+ requestObj.user.phone + ' - ' + requestObj.user.email}, 'SMS', 'Signup');
            } else if (code === 504) {
                logHandler.logger.error({message : 'Gateway Timeout for : '+ requestObj.user.phone + ' - ' + requestObj.user.email}, 'SMS', 'Signup');
            } else if (code === 500) {
                logHandler.logger.error({message : 'Internal Server Error : '+ requestObj.user.phone + ' - ' + requestObj.user.email}, 'SMS', 'Signup');
            } else {
                logHandler.logger.error({message : 'Unable to get SMS service, error occurs during call: '+ requestObj.user.phone + ' - ' + requestObj.user.email}, 'SMS', 'Signup');
            }
        }
    } catch (e) {
        logHandler.logger.error(e, 'SMS', 'Signup');
    }

}

/* Module exports for controllers and jobs */
module.exports = {
    SMSService,
    SMSMarketService
};
