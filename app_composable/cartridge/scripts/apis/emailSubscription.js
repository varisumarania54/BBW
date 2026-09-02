const subscriptionHelper = require('app_composable/cartridge/scripts/helpers/subscription/SubscriptionHelper.js');
const Site = require('dw/system/Site').getCurrent();
const Resource = require('dw/web/Resource');
const dataValidation = require('app_composable/cartridge/scripts/helpers/util/dataValidation').dataValidation;

/**
 * @function addCustomerInfoToCustomObjectTemplate
 * If customer is logged in, this adds profile information to the custom object template
 * to prepare for when it is added to a new custom object of emailSubscription type later
 * 
 * @param {object} emailSubscriptionCoTemplate - Contains all data that will be turned into a custom object later
 * @return {boolean} Returns true if the customer is logged in.
 *
 */

function addCustomerInfoToCustomObjectTemplate (emailSubscriptionCoTemplate) {
    
    let customerLoggedIn = false;

    if (customer && customer.registered && customer.authenticated) {
        let profile = customer.profile;
        if (!empty(profile)) {
            emailSubscriptionCoTemplate.email = profile.email;
            emailSubscriptionCoTemplate.customerID = profile.customerNo;
            emailSubscriptionCoTemplate.firstName = profile.firstName;
            emailSubscriptionCoTemplate.lastName = profile.lastName;
            emailSubscriptionCoTemplate.middleName = profile.secondName;
            emailSubscriptionCoTemplate.emailPref = profile.custom.isSubsciber ? 'Y' : 'N';
            customerLoggedIn = true;
        }        
    } else {
        emailSubscriptionCoTemplate.customerID = Date.now().toString().substr(0,13);
        customerLoggedIn = false;
    }

    return customerLoggedIn;
}


/**
 * @function emailSubscriptionInFooter
 * If subscription was submitted from the footer of the site, then this function is called to
 * create the email subscription custom object with all relevant data
 * 
 * @param {string} email - email that is subscribing
 * @param {string} consent - If user consents to subscribing
 * @return {object} Returns if the user successfully subscribed and custom object was created
 *
 */

exports.emailSubscriptionInFooter = function (location, email, consent, locale, country) {
    let result = { "success": false, "status": 404 };
    

    
    if(!dataValidation.isValidEmail(email)){
        return result;
    }

    let emailSubscriptionCoTemplate = subscriptionHelper.getEmptyObject();

    emailSubscriptionCoTemplate.pageSource = location;
    emailSubscriptionCoTemplate.emailPref = 'Y';
    emailSubscriptionCoTemplate.source = 'S';

    if (!empty(locale)) {
        emailSubscriptionCoTemplate.locale = locale.toUpperCase();
    }

    if (!empty(consent)) {
        emailSubscriptionCoTemplate.consent = consent;
    } else {
        emailSubscriptionCoTemplate.consent = 'E';
    }

    addCustomerInfoToCustomObjectTemplate(emailSubscriptionCoTemplate);
    emailSubscriptionCoTemplate.email = email;

    if (!empty(country) && country.toUpperCase() === 'CA') {
        subscriptionHelper.createCanadaSubscriber(emailSubscriptionCoTemplate);
    } else {
        subscriptionHelper.createSubscriber(emailSubscriptionCoTemplate);
    }

    result.success = true;
    result.status = 200;    

    return result;
}

/**
 * @function emailSubscriptionAfterOrderPlacement
 * If subscription was submitted from the order placed page of the site, then this function is called to
 * create the email subscription custom object with all relevant data
 * 
 * @param {string} orderNo - order number of order that was placed
 * @param {string} emailPref - if emailPref exists then user opts into being subscribed to
 * @param {string} payPalPayment - If order was a PayPal payment
 * @return {object} Returns if the user successfully subscribed and custom object was created
 *
 */


exports.emailSubscriptionAfterOrderPlacement = function (orderNo, emailPref, payPalPayment, country, state, locale) {
    let result = { "success": false, "status": 404 };
    const OrderMgr = require('dw/order/OrderMgr');
    const order = OrderMgr.getOrder(orderNo);
    
    if(empty(order) || !dataValidation.isValidEmail(order.customerEmail)){
        return result;
    }    

    let addr;
    
    if (!empty(order)) {
        addr = order.billingAddress;
    }
    
    let emailSubscriptionCoTemplate = subscriptionHelper.getEmptyObject();

    let emailPrefAltered = '';

    if (!empty(locale)) {
        emailSubscriptionCoTemplate.locale = locale.toUpperCase();
    }

    let customerLoggedIn = addCustomerInfoToCustomObjectTemplate(emailSubscriptionCoTemplate);
    

    if (!customerLoggedIn && !empty(order) && !empty(addr)){ 
        emailSubscriptionCoTemplate.email = order.customerEmail;
        
        emailSubscriptionCoTemplate.firstName = addr.firstName;
        emailSubscriptionCoTemplate.lastName = addr.lastName;
        emailSubscriptionCoTemplate.middleName = addr.secondName;
             
        emailSubscriptionCoTemplate.customerID = Date.now().toString().substr(0,13);
    } else if (!empty(order)) {
        emailSubscriptionCoTemplate.email = order.customerEmail;
    }
    

    if (!empty(order) && !empty(addr)){ 
        
        emailSubscriptionCoTemplate.billPhone = addr.phone;
        
        if (!empty(order.defaultShipment) && !empty(order.defaultShipment.shippingAddress)) {
            emailSubscriptionCoTemplate.shipPhone = order.defaultShipment.shippingAddress.phone;
        }
        
        emailSubscriptionCoTemplate.billAddress1 = addr.address1;
        emailSubscriptionCoTemplate.billAddress2 = addr.address2;
        emailSubscriptionCoTemplate.billCity = addr.city;
        emailSubscriptionCoTemplate.billState = addr.stateCode;
        emailSubscriptionCoTemplate.billZip = addr.postalCode;
        emailSubscriptionCoTemplate.billCountry = addr.countryCode.value;
    }
    
    
    
    // adds user to email subscription if they agreed on billing (default)
    if (emailPref) {
        emailPrefAltered = 'Y';
    } else {
        // adds user to email subscription if payment method is Paypal and user is in US
        if (payPalPayment && addr && addr.countryCode && addr.countryCode.value == 'US') {
            emailPrefAltered = 'Y';
            
        // no op, if payment method is Paypal and user is in CA
        } else if (payPalPayment && addr && addr.countryCode && addr.countryCode.value == 'CA') { 
            emailPrefAltered = '';
        } 
        
        // otherwise, if emailPref in args is false, set to empty - no op
        // if false, do not send N, the user should not be unsubscribed per BBWS-1305
    }
    
    emailSubscriptionCoTemplate.emailPref = emailPrefAltered;
    emailSubscriptionCoTemplate.pageSource = 'Checkout';
    emailSubscriptionCoTemplate.source = 'S';

    let enableQCPrivacyLaw = Site.getCustomPreferenceValue("enableQCPrivacyLaw");
    let consentFlag = 'I';

    //If user is in Quebec, Canada then consent need to be set to E because of their laws
    if (enableQCPrivacyLaw && (!empty(country) && country.toUpperCase() === 'CA') && (!empty(state) && state.toUpperCase() === 'QC')) {
        consentFlag = 'E';
    }

    emailSubscriptionCoTemplate.consent = consentFlag;
    
    if (!empty(country) && country.toUpperCase() === 'CA') {
        subscriptionHelper.createCanadaSubscriber(emailSubscriptionCoTemplate);
    } else {
        subscriptionHelper.createSubscriber(emailSubscriptionCoTemplate);
    }

    result.success = true;
    result.status = 200;    
        
    return result;
}

exports.emailSubscriptionInAccount = function (locale, country) {
    let result = { "success": false, "status": 404 };

    if (customer && customer.registered && customer.authenticated) {
        let emailSubscriptionCoTemplate = subscriptionHelper.getEmptyObject();

        if (!empty(locale)) {
            emailSubscriptionCoTemplate.locale = locale.toUpperCase();
        }

        addCustomerInfoToCustomObjectTemplate(emailSubscriptionCoTemplate);

        emailSubscriptionCoTemplate.pageSource = Resource.msg('common.emailsubs.account', 'common', 'Account');
        emailSubscriptionCoTemplate.source = 'S';

        emailSubscriptionCoTemplate.consent = 'I';
        
        if (!empty(country) && country.toUpperCase() === 'CA') {
            subscriptionHelper.createCanadaSubscriber(emailSubscriptionCoTemplate);
        } else {
            subscriptionHelper.createSubscriber(emailSubscriptionCoTemplate);
        }

        result.success = true;
        result.status = 200;    
    }

    return result;
}