'use strict';

const MailHelper = require('app_composable/cartridge/scripts/helpers/mail/mailHelper');
const Resource = require('dw/web/Resource');
const Site = require('dw/system/Site').getCurrent();

const EnableDefaultCardRemove = Site.getCustomPreferenceValue('EnableDefaultCardRemove');
const CustHelper = require('app_composable/cartridge/scripts/helpers/objects/customer');
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;
const Status = require('dw/system/Status');
const validationsUtil = require('app_composable/cartridge/scripts/helpers/util/validationsUtil');

const orderGrooveEnabled = Site.getCustomPreferenceValue('OrderGrooveEnable');
const SubscriptionHelper = require('app_composable/cartridge/scripts/helpers/subscription/SubscriptionHelper.js');


/**
 * Hook to check if a customer is Auto Refresh subscriber and if the card being deleted is
 * customer's default card before procedding with deleting the card
 * @param {dw.customer.Customer} customer
 * @param {*} paymentInstrumentId
 * @returns {dw.system.Status} - OK if successful OR error on code issues
 */
exports.beforeDELETE = function (customer: dw.customer.Customer, paymentInstrumentId: String) {
    try {
        // first check if this card is default card then only to OG call
        const payments = CustHelper.getPIList();
        const isDefaultCard = CustHelper.isDefaultCard(paymentInstrumentId);
        let isOGSub = false;

        if (isDefaultCard && orderGrooveEnabled) {
            isOGSub = SubscriptionHelper.isAutoRefreshSubscriber(customer);
        }

        if (payments.length === 0 || (isOGSub && isDefaultCard && !EnableDefaultCardRemove)) {
            throw new Error(Resource.msg('paymentInstruments.failedremoval', 'paymentInstruments', null));
        }

        return new Status(Status.OK);
    } catch (error) {
        logHandler.logger.error(error, 'Hooks', 'paymentInstruments');
        return new Status(Status.ERROR, 'ERROR', `Payment Instruments (paymentInstruments.js): ${error.message}`);
    }
}

/**
 * Hook update to send email to user after card has been successfully deleted.
 * @param {dw.customer.Customer} customer
 * @param {*} paymentInstrumentId
 * @returns {dw.system.Status} - OK if successful OR error on code issues
 */
exports.afterDELETE = function (customer: dw.customer.Customer, paymentInstrumentId: String) {
    // if user has deleted a credit card
    if (customer.isAuthenticated() && customer.isRegistered() && CustHelper.hasProfile() && !empty(customer.profile.email)) {
        try {
            if (Site.getCustomPreferenceValue('sendDeletePaymentEmail')) {
                MailHelper.setRequestLocale();
                const emailParams = {
                    subject: Resource.msg('paymentInstruments.email.deletecardsubject', 'paymentInstruments', null),
                    firstName: customer.profile.getFirstName(),
                    message: Resource.msg('paymentInstruments.email.deletecardmessage', 'paymentInstruments', null),
                    redirect: 'Account-Show'
                }
                MailHelper.sendMailwRender('ccupdateemail', customer.profile.email, emailParams);
            }
        } catch (e) {
            logHandler.logger.error(e, 'Hooks', 'paymentInstruments');
            return new Status(Status.ERROR, 'ERROR', e.message);
        }
    }
    return new Status(Status.OK);
}
