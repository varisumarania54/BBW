/**
 * @namespace addCouponToBasket.js
 */
'use strict';

const getBasketHelper = require('app_composable/cartridge/scripts/helpers/shopperBaskets/getBasketHelper.js');
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;
const Status = require('dw/system/Status');
const helper = require('app_composable/cartridge/scripts/helpers/shopperBaskets/couponHelper');
const validationsUtil = require('app_composable/cartridge/scripts/helpers/util/validationsUtil');
const errorHandler = require('app_composable/cartridge/scripts/helpers/util/errorHandler.js').errorHandler;

exports.beforePOST = function (basket, couponItem) {
    try {
        validationsUtil.validateRequestBody('Basket-Attributes');
        let isValidCoupon = helper.validateCouponCode(basket, couponItem);
        // if valid coupon check for loyalty validation
        if (empty(isValidCoupon)) {
            isValidCoupon = helper.validateLoyaltyCouponCode(basket, couponItem);
        }
        return isValidCoupon;
    } catch (e) {
        logHandler.logger.error(e, 'Hooks', 'addCoupon');
        return new Status(Status.ERROR, '400', errorHandler.getErrorMessage('COUPON-04-014'));
    }
};

exports.afterPOST = function (basket, couponItem) {
    try {
        if (helper.overCouponLimit(basket, couponItem)) {
            return new Status(Status.ERROR, '400', errorHandler.getErrorMessage('COUPON-04-010'));
        }
    }
    catch (e) {
        logHandler.logger.error(e, 'Hooks', 'addCoupon');
        return new Status(Status.ERROR, '400', errorHandler.getErrorMessage('COUPON-04-014'));
    }

    //Cant do this because it prevent calculate from running
    //return new Status(Status.OK)
};

exports.modifyPOSTResponse = function (basket: dw.order.Basket, basketResponse: Basket, couponRequest: CouponItem) {
    try {
        getBasketHelper.handleModify(basketResponse, basket);
        return new Status(Status.OK);
    } catch (e) {
        logHandler.logger.error(e, 'Hooks', 'addCoupon');
        return new Status(Status.ERROR);
    }
};
