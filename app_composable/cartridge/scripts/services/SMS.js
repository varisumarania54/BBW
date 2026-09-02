'use strict';
/**
 * @namespace SMS
 */
const LocalServiceRegistry = require('dw/svc/LocalServiceRegistry');
const StringUtils = require('dw/util/StringUtils');
const Site = require('dw/system/Site').getCurrent();
const OrderIdPrefix = !empty(Site.getCustomPreferenceValue('BBWOrderNumberPrefix')) ? Site.getCustomPreferenceValue('BBWOrderNumberPrefix') : '' ;
const smsMarketSource = Site.getCustomPreferenceValue('smsMarketSource');
const CalendarDate = new dw.util.Calendar();

/**
 * The SMS service
 * @function SMSRequest
 * @memberof SMS
 */
function SMSRequest() {
    let SMSConfig = LocalServiceRegistry.createService('sms.svc', {
        /**
         * Create request for SMS service authentication
         * @param {dw.svc.HTTPService} service - HTTPService instance
         * @param {Object} params - incoming service params
         *
         * @returns {Object} - request body
         */
        createRequest: function (service, params) {
            service.addHeader('Content-Type', 'application/json');
            service.setRequestMethod('POST');
            return JSON.stringify(params);
        },
        /**
         * @param {dw.svc.HTTPService} service - HTTPService instance
         * @param {Object} response - Service-specific response object.
         *
         * @returns {Object} - response text
         */
        parseResponse: function (service, response) {
            return response;
        },
        mockCall: function (service) {
            let requestObj = {
                'phonenumber': '+123456789',
                'ordernumber': '12345678',
                'email': 'test@gmail.com',
                'timestamp': '2022-01-25 18:10:59.638',
                'transactiontype': 'BOPIS',
                'smsoptin': 'I',
                'source': 'web'
            };

            return {
                statusCode: 200,
                statusMessage: 'OK',
                text: JSON.stringify(requestObj)
            };
        }
    });
    return SMSConfig;
}

/**
 * Builds the SMS request from the order object
 * @function SMSRequestObject
 * @memberof SMS
 * @param {Order} order - The order the user is signing up for
 */
function SMSRequestObject(order) {
    CalendarDate.setTimeZone('UTC');
    let requestObj = {
        'phonenumber': order.getShipments().toArray().find(e => !empty(e.custom.smsContactNumber)).custom.smsContactNumber,
        'ordernumber': OrderIdPrefix + order.orderNo,
        'email': order.customerEmail,
        'timestamp': StringUtils.formatCalendar(CalendarDate, 'yyyy.MM.dd HH:mm:ss'),
        'transactiontype': Site.getCustomPreferenceValue('SMSTransactiontype'),
        'smsoptin': Site.getCustomPreferenceValue('SMSOptin'),
        'source': Site.getCustomPreferenceValue('SMSSource')
    };
    return requestObj;
}

/**
 * The SMS marketing service
 * @function SMSMarketRequest
 * @memberof SMS
 */
function SMSMarketRequest() {
    let SMSConfig = LocalServiceRegistry.createService('smsmarket.svc', {
        /**
         * Create request for SMS marketing service authentication
         * @param {dw.svc.HTTPService} service - HTTPService instance
         * @param {Object} params - incoming service params
         *
         * @returns {Object} - request body
         */
        createRequest: function (service, params) {
            service.addHeader('Content-Type', 'application/json');
            service.setRequestMethod('POST');
            
            var credentials = service.getConfiguration().getCredential();
            var token = credentials.custom.apiToken;
            var auth = 'Bearer ' + token; //missing auth token
            service.addHeader('Authorization', auth);

            return JSON.stringify(params);
        },
        /**
         * @param {dw.svc.HTTPService} service - HTTPService instance
         * @param {Object} response - Service-specific response object.
         *
         * @returns {Object} - response text
         */
        parseResponse: function (service, response) {
            return response;
        },
        mockCall: function (service) {
            let requestObj = {
                "user": {
                  "phone": "+19148440001",
                  "email": "test@gmail.com"
                },
                "signUpSourceId": smsMarketSource
            };

            return {
                statusCode: 200,
                statusMessage: 'OK',
                text: JSON.stringify(requestObj)
            };
        },
        getResponseLogMessage: function(response) {
            try {
                let msg = '';
                let headers = response.getResponseHeaders();
                for each (let header in headers.keySet()) {
                    if (headers.get(header) && headers.get(header)[0]) {
                        msg += header + ':' + headers.get(header)[0] + '\n';
                    }
                }
                msg += 'statusMessage:' + response.statusMessage + '\n';
                msg += 'statusCode:' + response.statusCode + '\n';
                msg += 'text:' + response.text + '\n';
                msg += 'errorText:' + response.errorText + '\n';
                return msg;
            } catch(e) {
                return response;
            }
        }
    });
    return SMSConfig;
}

/**
 * Builds the SMS market request from the order object
 * @function SMSRequestObject
 * @memberof SMS
 * @param {Object} custData - The customer data used for signing up for marketing
 */
function SMSMarketRequestObject(custData) {
    let requestObj = {
        "user": {
            "phone": custData.phoneHome,
            "email": custData.email
        },
        "signUpSourceId": smsMarketSource
    };
    return requestObj;
}

module.exports = {
    SMSRequest,
    SMSRequestObject,
    SMSMarketRequest,
    SMSMarketRequestObject
}
