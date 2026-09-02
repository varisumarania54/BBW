/**
 * @namespace SubscriptionHelper
 */

'use strict';

const LocalServiceRegistry = require('dw/svc/LocalServiceRegistry');
const Site = require('dw/system/Site');
const HookMgr = require('dw/system/HookMgr');
const Resource = require('dw/web/Resource');
const hashHelper = require('app_composable/cartridge/scripts/helpers/util/cryptography.js');
const customerHelper = require('app_composable/cartridge/scripts/helpers/objects/customer.js');
/**
 * @function getEmptyObject
 * @memberof SubscriptionHelper
 * Returns an empty object that contains all fields needed to make an emailSubscription custom object
 *
 * @return {object} obj : empty template
*/


function getEmptyObject() {

    return {
        "firstName": "",
        "middleName": "",
        "lastName": "",
        "billPhone": "",
        "shipPhone": "",
        "billAddress1": "",
        "billAddress2": "",
        "billCity": "",
        "billState": "",
        "billZip": "",
        "billCountry": "",
        "email": "",
        "gender": "",
        "consent": "",
        "emailPref": "",
        "pageSource": "",
        "type": "",
        "source": "",
        "customerID": "",
        "bbwCreationDate": Date()
    };
}


/**
 * @function createSubscriber
 * @memberof SubscriptionHelper
 * Create custom object with custome subscriber info which will we used during subscribers import Job
 * @param {object} emailSubscriptionCoTemplate - contains all data to be transferred into a custom object
*/
function createSubscriber(emailSubscriptionCoTemplate) {
    const objectName = 'emailSubscription';
    if ('enableSubscribtion' in Site.current.preferences.custom && Site.current.preferences.custom.enableSubscribtion) {

        const dimentionKey = dw.util.UUIDUtils.createUUID();
        let obj = dw.object.CustomObjectMgr.createCustomObject(objectName, dimentionKey);

        obj.custom.transferStatus = 'N';

        for (let element in emailSubscriptionCoTemplate) {
            if (emailSubscriptionCoTemplate.hasOwnProperty(element)) {
                obj.custom[element] = emailSubscriptionCoTemplate[element];
            }
        }
    }
}

/**
 * @function createCanadaSubscriber
 * @memberof SubscriptionHelper
 * Creates a custom object with subscriber info for the subscriber import job.
 * @param {Object} emailSubscriptionCoTemplate - Data used to create the custom object.
 */
function createCanadaSubscriber(emailSubscriptionCoTemplate) {
    if (Site.getCurrent().getCustomPreferenceValue('enableSubscribtion')) {
        const emailSubsObject = 'BBWEmailSignUP';
        const objectKey = dw.util.UUIDUtils.createUUID();
        let obj = dw.object.CustomObjectMgr.createCustomObject(emailSubsObject, objectKey);

        obj.custom.bbwConsentFlag = emailSubscriptionCoTemplate.consent;
        obj.custom.bbwCreateDate = obj.creationDate;
        obj.custom.bbwEmail = emailSubscriptionCoTemplate.email;

        obj.custom.bbwLanguageComunications = emailSubscriptionCoTemplate.locale;
        obj.custom.bbwPageSource = emailSubscriptionCoTemplate.pageSource;
        obj.custom.bbwPostalCode = emailSubscriptionCoTemplate.billZip;
    }
}

/**
 * @function getSubscriberFlag
 * @memberof SubscriptionHelper
 * Builds/creates order groove get subscriber service
 * @param {dw.customer.Customer} customer - current customer
 * @returns OrderGroove.GetSubscriber service
*/
function getSubscriberFlag(customer) {
    const service = LocalServiceRegistry.createService('OrderGroove.GetSubscriber', {
        createRequest: function (service, params) {
            service.setRequestMethod('GET');
            service.addHeader("Content-Type", "application/json");
            let sig = HookMgr.callHook('ordergroove.encryptor', 'signature', customer.profile.customerNo);
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


/**
 * Function to make a call to OrderGroove.GetSubscriber service and return a boolean value as true/false
 * if customer is a auto refresh subscriber
 *
 * @function isAutoRefreshSubscriber
 * @memberof SubscriptionHelper
 * @param {dw.customer.Customer} customer
 * @returns boolean indicating if customer is a Auto Refresh subscriber or not
 */
function isAutoRefreshSubscriber(customer) {
    const customerSubscriberFlag = getSubscriberFlag(customer);
    let isARSubscribedUser = false;

    try {
        const response = customerSubscriberFlag.call();
        if (response.status === "OK" && customer.authenticated && customer.registered) {
            isARSubscribedUser = response.object.text === '1';
            customer.profile.custom.isAutoRefreshSubscribed = !isARSubscribedUser;
        }
    } catch (e) {
        dw.system.Logger.error(`order Groove isAutoRefreshSubscriber ${e.message} ${e.stack}`);
    }
    return isARSubscribedUser;
}

/**
 * create  a email subscriber from info that is on the order.
 *
 * @function addSubscriberCheckout
 * @memberof SubscriptionHelper
 * @param {dw.order.Order} order
 */
function addSubscriberCheckout(order) {
    const addr = order.billingAddress;
    let template = getEmptyObject();
    let emailPref = '';
    if (customer.registered && customer.authenticated && !empty(customer.profile)) {
        let profile = customer.profile;

        template.email = profile.email;
        template.firstName = profile.firstName;
        template.lastName = profile.lastName;
        template.middleName = profile.secondName;
        template.customerID = profile.customerNo;

    } else {
        template.email = order.customerEmail;
        template.firstName = addr.firstName;
        template.lastName = addr.lastName;
        template.middleName = addr.secondName;
        template.customerID = Date.now().toString().substr(0, 13);
    }

    template.billPhone = addr.phone;
    template.shipPhone = order.defaultShipment.shippingAddress.phone;
    template.billAddress1 = addr.address1;
    template.billAddress2 = addr.address2;
    template.billCity = addr.city;
    template.billState = addr.stateCode;
    template.billZip = addr.postalCode;
    template.billCountry = addr.countryCode.value;

    // adds user to email subscription if they agreed on billing (default)
    if (order.custom.emailPref) {
        emailPref = 'Y';
    } else {
        // adds user to email subscription if payment method is Paypal and user is in US
        if (!empty(order.getPaymentInstruments('PayPal')) && addr.countryCode.value == 'US') {
            emailPref = 'Y';

            // no op, if payment method is Paypal and user is in CA
        } else if (!empty(order.getPaymentInstruments('PayPal')) && addr.countryCode.value == 'CA') {
            emailPref = '';
        }

        // otherwise, if emailPref in args is false, set to empty - no op
        // if false, do not send N, the user should not be unsubscribed per BBWS-1305
    }

    template.emailPref = emailPref;
    template.pageSource = 'Checkout';
    template.source = 'S';
    template.consent = 'I';
    createSubscriber(template);
    let hashedEmail = hashHelper.hash(order.customerEmail);
    order.custom.emailHash = hashedEmail;
    customerHelper.hashEmail(customer);
}

module.exports = {
    getEmptyObject,
    createSubscriber,
    getSubscriberFlag,
    isAutoRefreshSubscriber,
    addSubscriberCheckout,
    createCanadaSubscriber
}
