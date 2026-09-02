'use strict';

const MailHelper = require('app_composable/cartridge/scripts/helpers/mail/mailHelper');
const Resource = require('dw/web/Resource');

const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;
const Status = require('dw/system/Status');

const CustHelper = require('app_composable/cartridge/scripts/helpers/objects/customer');
const PaymentCard = require('app_composable/cartridge/scripts/helpers/objects/paymentCard');

const Site = require('dw/system/Site').getCurrent();
const maxCardLimit = Site.getCustomPreferenceValue('MaxCardLimit');
const enableDWCCValidation = Site.getCustomPreferenceValue('EnableDWCCValidation');
const DisableCardSaveNoAddr = Site.getCustomPreferenceValue('DisableCardSaveNoAddr');
const validationsUtil = require('app_composable/cartridge/scripts/helpers/util/validationsUtil');


/**
 * Hook to validate customer payment methods being added
 * @param {dw.customer.Customer} customer
 * @param CustomerPaymentInstrumentRequest paymentInstrument
 * @returns {dw.system.Status} OK if successful OR error on code issues
 */
exports.beforePOST = function (customer: dw.customer.Customer, paymentInstrument) {
    try {

        if (empty(paymentInstrument) || empty(paymentInstrument.paymentCard)) {
            throw new Error('payment instrument is empty');
        }
        const card = paymentInstrument.paymentCard;

        // get existing payment methods
        const piList = CustHelper.getPIList();

        // check if max card limit has been reached
        if (piList.length >= maxCardLimit) {
            throw new Error('Card limit reached. Please remove an existing card to add a new one.');
        }

        if (enableDWCCValidation && !PaymentCard.validateSFCC_CC(customer, card)) {
            throw new Error('Invalid payment info');
        }

        // proceed with card addition only when there is no duplicate card
        if (piList.some(pi => pi.creditCardNumberLastDigits === card.number.slice(-4) && pi.creditCardType === card.cardType)) {
            throw new Error('Unable to add card. The payment method you are trying to add is already linked to your account.');
        }

        // generate radial token for credit card
        const radialCCToken = PaymentCard.getCardToken(paymentInstrument.paymentCard.number);
        if (!radialCCToken) {
            throw new Error('Unable to generate token for payment card');
        }
        paymentInstrument.paymentCard.creditCardToken = radialCCToken;

        // if there are no existing payment cards, make this card as default
        if (piList.length === 0) {
            paymentInstrument.c_DefaultCard = true;
        }

        // remove billing address Id if it is not present in customer's address book
        if (!empty(paymentInstrument.c_billingAddressId)) {
            if (!CustHelper.isSavedAddress(paymentInstrument.c_billingAddressId)) {
                if (DisableCardSaveNoAddr) {
                    throw new Error('Unable to add Payment card without associated address');
                }
                delete paymentInstrument.c_billingAddressId;
            }
        } else if (DisableCardSaveNoAddr) {
            throw new Error('Unable to add Payment card without associated address');
        }

        return new Status(Status.OK);
    } catch (e) {
        logHandler.logger.error(e, 'Hooks', 'paymentInstruments');
        return new Status(Status.ERROR, 'ERROR', e.message);
    }
}

/**
 * Hook update to send email after a card has been added to user account
 * @param {dw.customer.Customer} customer
 * @param CustomerPaymentInstrumentRequest paymentInstrument
 * @returns {dw.system.Status} - OK if successful OR error on code issues
 */
exports.afterPOST = function (customer: dw.customer.Customer, paymentInstrument) {
    try {
        if (empty(paymentInstrument) || empty(paymentInstrument.paymentCard)) {
            throw new Error('payment instrument is empty');
        }

        const card = paymentInstrument.paymentCard;
        const piList = CustHelper.getPIList();

        piList.forEach(pi => {
            let isNewPI = pi.creditCardNumberLastDigits === card.number.slice(-4) && pi.creditCardType === card.cardType;
            if (isNewPI) {
                // if token is not assigned to card but it is available in payload, add it to PI
                if (!pi.creditCardToken && card.creditCardToken) {
                    pi.setCreditCardToken(card.creditCardToken);
                }
            }
            // if current card is being set as default card, set DefaultCard to true only for that card and rest to false.
            if (paymentInstrument.c_defaultCard) {
                pi.custom.DefaultCard = isNewPI;
            }
        });
        if (Site.getCustomPreferenceValue('sendCreatePaymentEmail')) {
            // email related attributes
            MailHelper.setRequestLocale();
            const emailParams = {
                subject: Resource.msg('paymentInstruments.email.addcardsubject', 'paymentInstruments', null),
                message: Resource.msg('paymentInstruments.email.addcardmessage', 'paymentInstruments', null),
                firstName: customer.profile.getFirstName(),
                redirect: 'Account-Show'
            };
            // send an email to user when a new card has been added.
            MailHelper.sendMailwRender('ccupdateemail', customer.profile.email, emailParams);
        }
        
        return new Status(Status.OK);
    }
    catch (e) {
        logHandler.logger.error(e, 'Hooks', 'paymentInstruments');
        return new Status(Status.ERROR, 'ERROR', e.message);
    }
}
