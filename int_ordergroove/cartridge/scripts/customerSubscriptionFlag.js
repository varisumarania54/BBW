'use strict';

/* API Includes */
var LocalServiceRegistry = require('dw/svc/LocalServiceRegistry');
var Site = require('dw/system/Site');
var HookMgr = require('dw/system/HookMgr');
var Transaction = require("dw/system/Transaction");


function getSubscriberFlag(customer) {
    var service = LocalServiceRegistry.createService('OrderGroove.GetSubscriber', {
        createRequest: function (service, params) {
            service.setRequestMethod('GET');
            service.addHeader("Content-Type","application/json");
            var sig = HookMgr.callHook('ordergroove.encryptor', 'signature', customer.profile.customerNo);
            service.addParam('merchant_id', encodeURIComponent(Site.getCurrent().getCustomPreferenceValue('OrderGrooveMerchantID')))
      	    .addParam('user_id', encodeURIComponent(customer.profile.customerNo))
            .addParam('ts', sig.timestamp)
            .addParam('sig', sig.signature);
        },
        // Parse function only called for a status code in the 200s
        parseResponse: function (service, response) {
            return response;
        }
    });
    return service;
}

function subscriberHelper(customer) {
    var customerSubscriberFlag = getSubscriberFlag(customer);

    try {
        var response = customerSubscriberFlag.call();
        var isARSubscribedUser = false;
        if (response.status == "OK") {
            if(customer != null && customer.authenticated && customer.registered){
                if(response.object.text == '1') {
                	var isARSubscribedUser = true;
                    Transaction.wrap(function() {
                        customer.profile.custom.isAutoRefreshSubscribed = false;
                    });
                } else {
                	var isARSubscribedUser = false;
                    Transaction.wrap(function() {
                        customer.profile.custom.isAutoRefreshSubscribed = true;
                    });
                }
            }
        }
    } catch (e) {
        dw.system.Logger.error('ordergroove getsubscriber ' + e.message + e.stack);
    }
    return isARSubscribedUser;
}

/* Module export for controllers */
module.exports = {
	subscriberHelper: subscriberHelper
};