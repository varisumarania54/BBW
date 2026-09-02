'use strict';

/**
 * @namespace AddPaymentInsrumentToBasket
 */
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;
const Status = require('dw/system/Status');
const getBasketHelper = require('app_composable/cartridge/scripts/helpers/shopperBaskets/getBasketHelper.js');
const paymentInstrumentHelper = require('app_composable/cartridge/scripts/helpers/objects/paymentInstrument.js');
const Site = require('dw/system/Site').getCurrent();
const validationsUtil = require('app_composable/cartridge/scripts/helpers/util/validationsUtil');
const errorHandler = require('app_composable/cartridge/scripts/helpers/util/errorHandler.js').errorHandler;

/**
 * @function beforePOST
 * @memberof AddPaymentInsrumentToBasket
 * @param {dw.order.Basket} basket
 * @param {BasketPaymentInstrumentRequest} paymentInstrument
 * @returns
 */
exports.beforePOST = function (basket, paymentInstrument) {
    validationsUtil.validateRequestBody('Basket-Attributes');
    switch (paymentInstrument.paymentMethodId) {
        case 'GIFT_CERTIFICATE':
            // if gift card in basket, return error
            if (!session.userAuthenticated && (basket.getGiftCertificateLineItems().length > 0 || basket.productLineItems.toArray().some(e => e.product.custom.isGiftCard))) {
                return new Status(Status.ERROR, '403', errorHandler.getErrorMessage('ADDINSTRUMENT-04-001'));
            }

            let status = paymentInstrumentHelper.applyGCtoBasket(basket, paymentInstrument);
            if (!empty(status)) {
                return status;
            }
            break;
        case 'CREDIT_CARD':
            try {
                paymentInstrumentHelper.removeNonGiftInstruments(basket);
                paymentInstrumentHelper.processPaymentInstrument(paymentInstrument);
            } catch (e) {
                logHandler.logger.error(e, 'Hooks', 'Radial_CC');
                return request.custom.errMsg ? new Status(Status.ERROR, '500', request.custom.errMsg) : new Status(Status.ERROR, '500', 'Process_Card_Error');
            }
            break;
        case 'SECURE_PAYMENT':
            paymentInstrumentHelper.removeNonGiftInstruments(basket);
            if (!session.userAuthenticated || (Site.getCustomPreferenceValue('doOcapiChecksForPCIPAL') && !session.custom.isSecurePayment)) {
                return new Status(Status.ERROR);
            }
            break;
        default:
            paymentInstrumentHelper.removeNonGiftInstruments(basket);
            break;
    }
};

/**
 * @function modifyPOSTResponse
 * @memberof AddPaymentInsrumentToBasket
 * @param {dw.order.Basket} basket
 * @param {Basket} basketResponse
 * @param {BasketPaymentInstrumentRequest} paymentInstrumentRequest
 * @returns
 */
exports.modifyPOSTResponse = function (basket, basketResponse, paymentInstrumentRequest) {
    try {
        getBasketHelper.handleModify(basketResponse, basket);
    } catch (e) {
        logHandler.logger.error(e, 'Hooks', 'addPayMod');
        return new Status(Status.ERROR);
    }
}
