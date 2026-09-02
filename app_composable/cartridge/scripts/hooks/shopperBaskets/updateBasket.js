'use strict';
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;
const getBasketHelper = require("app_composable/cartridge/scripts/helpers/shopperBaskets/getBasketHelper.js")
const Status = require("dw/system/Status");
const basketHelper = require('app_composable/cartridge/scripts/helpers/objects/basket.js');
const validationsUtil = require('app_composable/cartridge/scripts/helpers/util/validationsUtil');

exports.modifyPATCHResponse = function (basket: dw.order.Basket, basketResponse: Basket) {
    try {
        getBasketHelper.handleModify(basketResponse, basket);
    }
    catch (e) {
        logHandler.logger.error(e, 'Hooks', 'updateBasket');
        return new Status(Status.ERROR);
    }
}

exports.afterPATCH = function (basket: dw.order.Basket, basketInput: Basket) {
    try {
        basketHelper.cleanUpProductLevelMessaging(basket);
        basketHelper.handleRemoveDissmisableMessages(basket,basketInput.c_dismissedMessage)
        if(!empty(basketInput.c_customerCommunicationEmail) && session.userAuthenticated){
            basket.setCustomerEmail(basketInput.c_customerCommunicationEmail);
        }
    }
    catch (e) {
        logHandler.logger.error(e, 'Hooks', 'updateBasket');
    }
}

/**
 * Hook function for beforePATCH of Basket.
 *
 * @param {dw.order.Basket} basket - The current basket
 * @param {Object} basketInput - The input data for the basket
 * @returns {dw.system.Status} - The status of the validation
 */
exports.beforePATCH = function(basket, basketInput){
    try {
        validationsUtil.validateRequest(basketInput, 'Basket-Attributes');
        basketHelper.cleanUpProductLevelMessaging(basket);
    }
    catch (e) {
        logHandler.logger.error(e, 'Hooks', 'updateBasket');
        return new Status(Status.ERROR);
    }

}

/**
 * Hook function for beforePOST of Basket.
 *
 * @param {dw.order.Basket} basketRequest - The current basket request
 * @returns {dw.system.Status} - The status of the hook
 */
exports.beforePOST_v2 = function(basketRequest){
    try {
        validationsUtil.validateRequest(basketRequest, 'Basket-Attributes');
    }
    catch (e) {
        logHandler.logger.error(e, 'Hooks', 'updateBasket');
        return new Status(Status.ERROR);
    }
}
