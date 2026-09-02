'use strict'

const errorHandler = require('app_composable/cartridge/scripts/helpers/util/errorHandler.js').errorHandler;
const smsService = require('app_composable/cartridge/scripts/services/SMS.js');

/**
 * SMS Marketing API to register customer for marketing texts
 * @function post
 * @memberof SMS
 * @param {String} custData - email string 
 * @return {Object} result of marketing optin api
 */
exports.post = function (custData) {

    let errorMsg, result = {'status': 400};

    if (empty(custData)) {
        errorMsg = 'Empty Customer Data';
    } else {
        let reqObj = smsService.SMSMarketRequestObject(custData);
        let service = smsService.SMSMarketRequest();
        let data = service.call(reqObj);

        if (empty(data.errorMessage)) {
            result.status = 200;
            result.response = !empty(data.object.text) ? JSON.parse(data.object.text) : '';
        }
    } 
    
    //Generate new error for custom error and logging
    if (!empty(errorMsg)) {
        throw new errorHandler.newError('SMS Market Optin Error', errorMsg, result.status, 'smsMarketing.js');
    }

    return result;
}