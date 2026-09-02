/**
 * @namespace PaymentInstrument
 */

'use strict';

const PayPalService = require('int_radial_composable/cartridge/scripts/payments/paypal/PaypalService.js');
const GiftCardServiceHelper = require('int_radial_composable/cartridge/scripts/payments/GiftCard/GiftCardServiceHelper.js');
const RadialHelpers = require('int_radial_composable/cartridge/scripts/helpers/RadialHelper.js')
const recaptcha = require('app_composable/cartridge/scripts/helpers/recaptcha/recaptchaValidation');
const Site = require('dw/system/Site').getCurrent();
const Status = require("dw/system/Status");
const Money = require("dw/value/Money");
const resource = require('dw/web/Resource');
const validateCreditCard = require("app_composable/cartridge/scripts/helpers/objects/paymentCard.js");
const creditAuth = require('int_radial_composable/cartridge/scripts/payments/creditcard/creditCardServiceHelper.js');
const errorHandler = require('app_composable/cartridge/scripts/helpers/util/errorHandler.js').errorHandler;
const taxService = require('int_radial_composable/cartridge/scripts/rom/tax/taxServiceHelper.js');
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler.logger;
const Resource = require("dw/web/Resource");

/**
 * Authorize the applepay payment type by going through radial.
 * @function authApplePay
 * @memberof PaymentInstrument
 * @param {OrderPaymentInstrument} paymentInstrument - The sfcc payment instrument object
 * @param {dw.order.LineItemCtnr} lineItemCtnr - The sfcc line item container  object
 * @param {String} orderNo - the order number
 */
function authApplePay(paymentInstrument, lineItemCtnr, orderNo) {
    const applePayData = paymentInstrument.custom.customData;
    if (empty(applePayData)) {
        logHandler.failOrderAddLogInformation(lineItemCtnr, 'PAYMENT_DETAILS_INCOMPLETE_NOT_AUTHED');
        throw new Error(resource.msg('invalidcreditcardJSON', 'billing', null));
    }
    // let wrappedData = { "token": JSON.parse(applePayData) }
    let wrappedData = { applePayResponseData: { payment: { "token": JSON.parse(applePayData) } } }

    const response = creditAuth.creditCardAuthorize(lineItemCtnr, paymentInstrument, wrappedData, orderNo);
    let result = response.success ? response.authResult : null;
    if (empty(result) && !response.success) {
        logHandler.failOrderAddLogInformation(lineItemCtnr, 'PAYMENT_AUTH_DECLINE');
        throw new Error(resource.msg('invalidcreditcardJSON', 'billing', null));
    }
}

/**
 * Authorize the paypal payment type by going through radial.
 * @function paypalAuth
 * @memberof PaymentInstrument
 * @param {dw.order.LineItemCtnr} lineItemCtnr - The sfcc line item container  object
 * @param {String} orderNo - the order number
 *  */
function paypalAuth(lineItemCtnr, orderNo) {
    // Do Express
    const doExpressResult = PayPalService.DoExpress(lineItemCtnr, orderNo);
    if (doExpressResult.ResponseCode != 'Success') {
        throw new Error(doExpressResult.ErrorMessage);
    }
    //Do Auth
    const authResult = PayPalService.DoAuthorization(lineItemCtnr, orderNo);
    if (authResult.ResponseCode != 'Success' && authResult.ResponseCode != 'SuccessWithWarning') {

        logHandler.failOrderAddLogInformation(lineItemCtnr, 'PAYMENT_AUTH_DECLINE');

        const errorMessage = new String(authResult.ErrorMessage);
        if (!empty(errorMessage)) {
            throw new Error(resource.msg('invalidcreditcardJSON', 'billing', null));
        } else {
            throw new Error('Unknown PayPal Error');
        }
    }
}

/**
 * Validate a gift card via radial.
 * @function applyGCtoBasket
 * @memberof PaymentInstrument
 * @param {Basket} basket - Current users basket
 * @param {OrderPaymentInstrument} paymentInstrument - The GC payment instrument
 * @returns {Status} - Error if applicable
 */
function applyGCtoBasket(basket, paymentInstrument) {
    let result = {
        success: true
    };

    try {
        /**
         * First, validate with Google ReCaptcha service to prevent spam/abuse
         * The ReCaptcha check can be skipped if the customer just did a ReCaptcha for Balance Check (once)
         */
        //UPDATE with new way

        const validationError = recaptcha.validateToken(recaptcha.TRANSACTION, recaptcha.decideKeyConfigFromPlatform(paymentInstrument.c_platform, recaptcha.BILLINGGC,'GIFT_CARD'), null, 'GIFT_CARD');

        if (validationError) {
            throw (validationError);
        }
        const tenderType = RadialHelpers.getCCType(paymentInstrument.giftCertificateCode, 'StoredValue', false);
        //gift card validation
        // changes to allow max 2 gift cards per order
        let maxNumberOfGCs = Site.getCustomPreferenceValue('maxGiftCardApplication');
        if (basket.getGiftCertificatePaymentInstruments().size() > (maxNumberOfGCs - 1)) {
            return new Status(Status.ERROR, '400', errorHandler.getErrorMessage('ADDINSTRUMENT-04-002', maxNumberOfGCs));
        }

        /**
         * making sure we do not apply same Gift Card twice
         */
        let gcInstruments = basket.getGiftCertificatePaymentInstruments(paymentInstrument.giftCertificateCode);
        gcInstruments.toArray().forEach(gcInstrument => {
            basket.removePaymentInstrument(gcInstrument);
        });

        let availableBalance = GiftCardServiceHelper.getBalance_v2(paymentInstrument.giftCertificateCode, paymentInstrument.paymentCard.issueNumber, tenderType);
        let balance = new Money(new Number(availableBalance), basket.getCurrencyCode());
        // check balance of card
        // this logic does exist already, abstract and apply both places.
        if (balance.value == 0) {
            return new Status(Status.ERROR, '400', errorHandler.getErrorMessage('ADDINSTRUMENT-04-003'));
        } else if (balance.value < 0) { // will have a value of -1 if ResponseCode = Fail, case of wrong PIN
            return new Status(Status.ERROR, '400', errorHandler.getErrorMessage('ADDINSTRUMENT-04-004'));
        }

        //Need accurate taxes to know if the grand total is 0
        taxService.calculateRealTaxesOnBasket(basket, basket.custom.PrevTaxCallStatus != "radial" || !request.custom.skipTax);
        let orderTotal = basket.getTotalGrossPrice();
        const amountToRedeem = calculateAmount(balance, orderTotal, basket);
        const orderBalance = calculateOrderBalance(orderTotal, basket).subtract(amountToRedeem);
        if (amountToRedeem.value === 0) {
            return new Status(Status.ERROR, '400', errorHandler.getErrorMessage('ADDINSTRUMENT-04-005'));
        }

        request.custom.c_baskettotal = orderBalance.value;
        // create a payment instrument from this gift certificate
        paymentInstrument.amount = amountToRedeem.value;
        paymentInstrument.c_gcMaxApplicable = balance.value;
        //const paymentInstr = basket.createGiftCertificatePaymentInstrument(cardNumber, amountToRedeem);
        paymentInstrument.c_RadialGCPin = paymentInstrument.paymentCard.issueNumber;
        paymentInstrument.c_RadialGCTenderType = tenderType;
        paymentInstrument.c_GCNumber = paymentInstrument.giftCertificateCode

    } catch (e) {
        if(request.custom.errMsg){
            return new Status(Status.ERROR, '500',request.custom.errMsg);
        }
        if(!result.message) {
            result.message = resource.msg('giftcertinvalid', 'billing', null);
            result.errortype = 'invalidgc';
            return new Status(Status.ERROR, '400', errorHandler.getErrorMessage('ADDINSTRUMENT-04-006'));
        }
        else {
            return new Status(Status.ERROR, '500', Resource.msg('invalidcreditcardJSON', 'billing', null));
        }
    }
}

/**
 * Authorize the gift card payment type by going through radial.
 * @function redeemGC
 * @memberof PaymentInstrument
 * @param {dw.order.LineItemCtnr} lineItemCtnr -The sfcc order object
 * @param {OrderPaymentInstrument} paymentInstrument - The GC payment instrument
 * @param {PaymentProcessor} paymentProcessor - The sfcc paymentProcessor object
 * @param {String} orderNo - the order number
 */
function redeemGC(lineItemCtnr, paymentInstrument, paymentProcessor, orderNo) {
    const amount = paymentInstrument.paymentTransaction.amount;
    const giftCertID = paymentInstrument.getGiftCertificateCode();
    const pin = paymentInstrument.custom.RadialGCPin;

    /**
     * virtual and plastic gift cards have different endpoints
     */
    let tenderType = null;
    if ('RadialGCTenderType' in paymentInstrument.custom && !empty(paymentInstrument.custom.RadialGCTenderType)) {
        tenderType = paymentInstrument.custom.RadialGCTenderType;
    }

    const availableBalance = new Number(GiftCardServiceHelper.getBalance_v2(giftCertID, pin, tenderType));

    if (availableBalance < amount.getValue()) {
        throw new Error('card ' + giftCertID + ' has amount:' + availableBalance + ', which is less than captured amount: ' + amount.getValue());
    } else {
        const serviceResult = GiftCardServiceHelper.redeem(giftCertID, pin, amount.getValue(), lineItemCtnr, tenderType, orderNo);
        const transactionID = serviceResult.result.PaymentContext.PaymentSessionId;
        let paymentTransaction = paymentInstrument.getPaymentTransaction();
        paymentTransaction.setTransactionID(transactionID);
        paymentTransaction.custom.RadialPaymentToken = new String(serviceResult.result.PaymentContext.PaymentAccountUniqueId);
        paymentTransaction.custom.RadialTenderType = serviceResult.tender;
        paymentTransaction.paymentProcessor = paymentProcessor;
    }
}

/**
 * clear all payment instruments excluding GIFT_CERTIFICATE from the basket
 * @function removeNonGiftInstruments
 * @memberof PaymentInstrument
 * @param {Basket} basket
 */
function removeNonGiftInstruments(basket) {
    if (!empty(basket) && !empty(basket.getPaymentInstruments())) {
        let paymentInstruments = basket.getPaymentInstruments();
        if (paymentInstruments.length > 0) {
            paymentInstruments.toArray().forEach(orderPIns => {
                if (orderPIns.getPaymentMethod() != dw.order.PaymentInstrument.METHOD_GIFT_CERTIFICATE) {
                    basket.removePaymentInstrument(orderPIns);
                }
            });
        }
    }
}

/**
 * Calculates the amount to redeem for this gift certificate by subtracting
 * the amount of all of other gift certificates from the order total.
 * @function calculateAmount
 * @memberof PaymentInstrument
 * @param {Number} amountToRedeem - The amount to redeem.
 * @param {Money} orderTotal - The total order amount.
 * @param {Basket} basket - The basket object.
 * @returns {Money} The amount to redeem.
 */
function calculateAmount(amountToRedeem, orderTotal, basket) {
    let giftCertTotal = new Money(0.0, basket.currencyCode);

    // iterate over the list of gift certificate payment instruments and update the total redemption amount
    const gcPaymentInstrs = basket.getGiftCertificatePaymentInstruments();
    //add up all gift certificate lineItems to one total
    gcPaymentInstrs.toArray().forEach(orderPI => giftCertTotal = giftCertTotal.add(orderPI.getPaymentTransaction().getAmount()));

    // calculate the remaining order balance this is the remaining open order total which has to be paid
    let orderBalance = orderTotal.subtract(giftCertTotal);

    // the redemption amount exceeds the order balance
    // return the order balance as maximum redemption amount
    if (orderBalance < amountToRedeem) {
        //remove all previous non-GC payment instruments
        let paymentInstrs = basket.getPaymentInstruments();
        paymentInstrs.toArray().forEach((orderPIns) => {
            if (orderPIns.getPaymentMethod() != dw.order.PaymentInstrument.METHOD_GIFT_CERTIFICATE) {
                basket.removePaymentInstrument(orderPIns);
            }
        })
        // return the remaining order balance
        return orderBalance;
    }
    // just return the redemption amount in case it is lower
    // or equals the order balance
    return amountToRedeem;
}

/**
* Order total amount after redemption by subtracting
* the amount of all of other gift certificates from the order total.
* @function calculateOrderBalance
* @memberof PaymentInstrument
* @param {Money} orderTotal
* @param {Basket} basket
* @returns
*/
function calculateOrderBalance(orderTotal, basket) {
    // the total redemption amount of all gift certificates for the basket
    let giftCertTotal = new Money(0.0, basket.currencyCode);
    // iterate over the list of gift certificate payment instruments
    // and update the total redemption amount
    const gcPaymentInstrs = basket.getGiftCertificatePaymentInstruments();
    gcPaymentInstrs.toArray().forEach((orderPI) => giftCertTotal = giftCertTotal.add(orderPI.getPaymentTransaction().getAmount()));
    // return calculation of the remaining order balance
    // this is the remaining open order total which has to be paid

    return orderTotal.subtract(giftCertTotal);
}

/**
 * Used for tokenizing payment and identifying payment type and adding those values to paymentInstrument
 * @function processPaymentInstrument
 * @memberof PaymentInstrument
 * @param {PaymentProcessor} paymentInstrument
 */
function processPaymentInstrument(paymentInstrument) {
    /**
    First, validate with Google ReCaptcha service to prevent spam/abuse
    */
    const validationError = recaptcha.validateToken(recaptcha.TRANSACTION, recaptcha.decideKeyConfigFromPlatform(paymentInstrument.c_platform,recaptcha.PAYMENTINSTRUMENT,'PAYMENT'), null ,'PAYMENT');
    if (validationError) {
        throw (validationError);
    }
    if(empty(paymentInstrument.c_aurusOneTimeToken) && !empty(paymentInstrument.paymentCard) && !empty(paymentInstrument.paymentCard.cardType)){
        let newId = transformPaymentTypeToSfccId(paymentInstrument.paymentCard.cardType);
        paymentInstrument.paymentCard.cardType = !empty(newId) ? newId : paymentInstrument.paymentCard.cardType;
    }
    if (isPaymentInstrumentExpired(paymentInstrument)) {
        throw new Error("Card_Not_Valid")
    }
    if(paymentInstrument.c_aurusOneTimeToken){
        const AurusHelper = require('int_aurus_composable/cartridge/scripts/helpers/Aurus.js');
        paymentInstrument.paymentCard.cardType = AurusHelper.mapAurusCardTypeToSFCCardType(paymentInstrument.paymentCard.cardType)
        paymentInstrument.custom.aurusCreditCardOneTimeTOken = paymentInstrument.c_aurusOneTimeToken;
    }else{
        const isToken = !empty(paymentInstrument.paymentCard.creditCardToken);
        const PAN = isToken ? paymentInstrument.paymentCard.creditCardToken : paymentInstrument.c_number;
        paymentInstrument.paymentCard.cardType = RadialHelpers.paymentMapping[RadialHelpers.getCCType(PAN, 'CreditCard', isToken)];
        paymentInstrument.paymentCard.number = PAN;
        const cardValid = validateCreditCard.validateSFCC_CC(customer, paymentInstrument.paymentCard, isToken)
        if (!cardValid) {
            request.custom.errMsg = Resource.msg('invalidcreditcardJSON', 'billing', null)
            throw new Error(Resource.msg('invalidcreditcardJSON', 'billing', null))
        }
        if(!isToken){
            paymentInstrument.paymentCard.creditCardToken = RadialHelpers.getRadialCCToken(PAN)
        }
    }

}


/**
 * @function isPaymentInstrumentExpired
 * @memberof PaymentInstrument
 * @param {Object} paymentInstrument
 * @returns {Boolean} returns true if the payment is expired.
 */
function isPaymentInstrumentExpired(paymentInstrument) {
    let expDate = new Date(paymentInstrument.paymentCard.expirationYear, paymentInstrument.paymentCard.expirationMonth - 1);
    let currentDate = new Date();
    let currentDateWithoutDay = new Date(currentDate.getFullYear(), currentDate.getMonth())
    return currentDateWithoutDay > expDate;
}

/**
 * @function paymentTypeCheck
 * @memberof PaymentInstrument
 * @param {String} paymentType
 * @returns {String} paymentType
 */
function paymentTypeCheck(paymentType) {
    const paymentTypeList = Object.values(RadialHelpers.paymentMapping)
    const foundType = paymentTypeList.find(e => e.toLowerCase() == paymentType.toLowerCase())
    return foundType ? foundType : paymentType
}

/**
 * @function transformPaymentTypeToSfccId
 * @memberof PaymentInstrument
 * @param {String} paymentType
 * @returns {String} the SFCC payment type
 */
function transformPaymentTypeToSfccId(paymentType) {
    var payments = dw.order.PaymentMgr.getActivePaymentMethods();
    let paymentID = null;
    payments.toArray().some(paymentMethod => {
        if ("activePaymentCards" in paymentMethod && !empty(paymentMethod.activePaymentCards)) {
            return paymentMethod.activePaymentCards.toArray().some(paymentCard => {
                if (paymentCard.cardType.toLowerCase() == paymentType.toLowerCase()) {
                    paymentID = paymentCard.cardType;
                    return true;
                }
                return false;
            })
        }
        return false;
    });
    return paymentID;
}

module.exports = {
    applyGCtoBasket,
    authApplePay,
    paypalAuth,
    redeemGC,
    processPaymentInstrument,
    removeNonGiftInstruments
}


