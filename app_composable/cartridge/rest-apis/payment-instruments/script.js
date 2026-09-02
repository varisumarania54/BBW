'use strict'

const apiUtils = require('app_composable/cartridge/scripts/apiUtils.js');
const apiImplementation = require('app_composable/cartridge/scripts/apis/updatePayment.js');
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;
const MailHelper = require('app_composable/cartridge/scripts/helpers/mail/mailHelper');
const Resource = require('dw/web/Resource');
const Site = require('dw/system/Site').getCurrent();

/**
 * This SCAPI CUSTOM API endpoint is used to update customer payment
 */
exports.updatePayment = function () {
    try {
        let requestBody = JSON.parse(request.httpParameterMap.requestBodyAsString);
        let c_paymentInstrumentId = !empty(requestBody) && !empty(requestBody.c_paymentInstrumentId) ? requestBody.c_paymentInstrumentId : '';
        let c_billingAddressId = !empty(requestBody) && !empty(requestBody.c_billingAddressId) ? requestBody.c_billingAddressId : '';
        let c_defaultCard = !empty(requestBody) && !empty(requestBody.c_defaultCard) ? requestBody.c_defaultCard : '';

        let response = apiImplementation.post.updatePaymentInfo({ c_paymentInstrumentId, c_billingAddressId, c_defaultCard });

        apiUtils.createResponse(response.status, response);

        if (response.status === 200) {
            let emailParams = {
                firstName: customer.profile.getFirstName(),
                redirect: 'Account-Show'
            };
            if(response.defaultCardUpdated && Site.getCustomPreferenceValue('sendUpdateDefaultPaymentEmail')) {
                MailHelper.setRequestLocale();
                emailParams.subject = Resource.msg('paymentInstruments.email.defaultcardsubject', 'paymentInstruments', null),
                emailParams.message = Resource.msg('paymentInstruments.email.defaultcardmessage', 'paymentInstruments', null),
                MailHelper.sendMailwRender('ccupdateemail', customer.profile.email, emailParams);
            } else if(response.addressChanged && Site.getCustomPreferenceValue('sendEditPaymentAddressEmail')) {
                MailHelper.setRequestLocale();
                emailParams.subject = Resource.msg('paymentInstruments.email.editcardsubject', 'paymentInstruments', null),
                emailParams.message = Resource.msg('paymentInstruments.email.editcardmessage', 'paymentInstruments', null),
                MailHelper.sendMailwRender('ccupdateemail', customer.profile.email, emailParams);
            }
        }

    } catch (e) {
        let httpCode = e.httpCode || 500;
        apiUtils.createError(httpCode, {
            title: e.name || 'updatePaymentDefault',
            type: e.type || 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/' + httpCode,
            detail: e.message || 'An unexpected error occurred while processing the request.'
        });

        logHandler.logger.error(e, 'CustomAPI', 'updatePayment');
    }
};

exports.updatePayment.public = true;
