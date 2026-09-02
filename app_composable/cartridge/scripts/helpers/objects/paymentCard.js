/**
 * A namespace.
 * @namespace PaymentCard
 */

'use strict';
const PaymentMgr = require('dw/order/PaymentMgr');
const Locale = require('dw/util/Locale');
const PaymentInstrument = require('dw/order/PaymentInstrument');
const PaymentStatusCodes = require('dw/order/PaymentStatusCodes');
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;
const RadialHelpers = require('int_radial_composable/cartridge/scripts/helpers/RadialHelper.js');

/**
 * Checks if a credit card is valid or not
 * @function validateSFCC_CC
 * @param {*} customer
 * @param {Object} card - plain object with card details
 * @returns {boolean} a boolean representing card validation
 */
function validateSFCC_CC(customer, card, isToken) {
    const localeCountry =  Locale.getLocale(request.locale).country;
    const countryCode = request.geolocation.getCountryCode() || localeCountry ;
    const creditCardPaymentMethod = PaymentMgr.getPaymentMethod(PaymentInstrument.METHOD_CREDIT_CARD);
    const paymentCard = PaymentMgr.getPaymentCard(card.cardType);

    if (!paymentCard) {
        logHandler.logger.warn(`Invalid credit card type - ${card.cardType}`);
        return false;
    }

    const applicablePaymentCards = creditCardPaymentMethod.getApplicablePaymentCards(customer, countryCode, null);

    if (!applicablePaymentCards.contains(paymentCard)) {
        logHandler.logger.warn('Invalid payment method');
        return false;
    }

    // verify credit card if its not already a token
    const creditCardStatus = !isToken ? paymentCard.verify(card.expirationMonth, card.expirationYear, card.number) : null;

    if (creditCardStatus && creditCardStatus.error) {
        if (creditCardStatus.code === PaymentStatusCodes.CREDITCARD_INVALID_CARD_NUMBER) {
            logHandler.logger.warn('Invalid Credit Card Number');
        } else if (creditCardStatus.code === PaymentStatusCodes.CREDITCARD_INVALID_EXPIRATION_DATE) {
            logHandler.logger.warn('Invalid Credit Card Expiration Date');
        }
        return false;
    }

    return true;
}

/**
 * Gets radial generated card token
 * @function getCardToken
 * @param {*} cardNumber
 * @returns
 */
function getCardToken(cardNumber) {
    return RadialHelpers.getRadialCCToken(cardNumber);
}

module.exports = {
    validateSFCC_CC,
    getCardToken
}
