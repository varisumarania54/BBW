'use strict';

const getBasketHelper = require("app_composable/cartridge/scripts/helpers/shopperBaskets/getBasketHelper.js")
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;
const Status = require("dw/system/Status");
const basketHelper = require('app_composable/cartridge/scripts/helpers/objects/basket.js');
const validationsUtil = require('app_composable/cartridge/scripts/helpers/util/validationsUtil');


exports.modifyDELETEResponse = function(basket : dw.order.Basket, basketResponse : Basket, couponRequest : CouponItem){
    try {
        getBasketHelper.handleModify(basketResponse,basket);
        return new Status(Status.OK);
    }
    catch (e){
        logHandler.logger.error(e, 'Hooks', 'getBasketModify');
        return new Status(Status.ERROR);
    }
}


exports.afterDELETE = function   (basket : dw.order.Basket, couponItemID : String) {
    try {
        basketHelper.cleanUpProductLevelMessaging(basket);
    }
    catch (e){
        logHandler.logger.error(e, 'Hooks', 'removeCoup');
    }
}


/**
 * Before DELETE coupon hook.
 *
 * This hook is called before the coupon is removed from the basket.
 *
 * @param {dw.order.Basket} basket - The current basket
 * @param {String} couponItemID - The ID of the coupon that is being removed from the basket
 *
 * @returns {dw.system.Status} - The status of the validation
 */
exports.beforeDELETE = function (basket, couponItemID) {

    return new Status(Status.OK);
}
