'use strict'

const Locale = require('dw/util/Locale');

const apiImplementation = require('app_composable/cartridge/scripts/apis/emailSubscription.js');
const apiUtils = require('app_composable/cartridge/scripts/apiUtils.js');
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;
const dataValidation = require('app_composable/cartridge/scripts/helpers/util/dataValidation.js').dataValidation;

/**
 * This SCAPI CUSTOM API endpoint is used to create an emailSubscription custom object when user opts into
 * marketing emails in the footer or after placing an order
 */
exports.subscription = function () {
    try {
        let response = { "success": false, "status": 404 };
        const requestBody = JSON.parse(request.httpParameterMap.requestBodyAsString);
        const location = dataValidation.emptyCheck(requestBody.location, '');
        const country = dataValidation.emptyCheck(requestBody.country, Locale.getLocale(request.locale).country);
        const state = dataValidation.emptyCheck(requestBody.state, '');
        const locale = dataValidation.emptyCheck(requestBody.locale, '');


        if (location == 'Footer' || location == 'calightbox' || location == 'caemailsignuplp' ) {
            const email = dataValidation.emptyCheck(requestBody.email, '');
            const consent = dataValidation.emptyCheck(requestBody.consent, '');
            response = apiImplementation.emailSubscriptionInFooter(location, email, consent, locale, country);
        } else if (location == 'OrderPlacement'){
            const orderNo = dataValidation.emptyCheck(requestBody.orderNo, '');
            if (!empty(orderNo)) {
                const emailPref = dataValidation.emptyCheck(requestBody.emailPref, '');
                const payPalPayment = dataValidation.emptyCheck(requestBody.payPalPayment, '');
                response = apiImplementation.emailSubscriptionAfterOrderPlacement(orderNo, emailPref, payPalPayment, country, state, locale);
            }
        } else if (location == 'Account') {
            response = apiImplementation.emailSubscriptionInAccount(locale, country);
        }

        apiUtils.createResponse(response.status, response);
    } catch (e) {
        let httpCode = e.httpCode || 500;
        apiUtils.createError(httpCode, {
            title: e.name || 'EmailSubscriptionError',
            type: e.type || 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/' + httpCode,
            detail: e.message || 'An unexpected error occurred while processing the request.'
        });
        logHandler.logger.error(e, 'CustomAPI', 'emailSub');
    }
};

exports.subscription.public = true;
