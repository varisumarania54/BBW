'use strict';
var getBasketHelper = require("app_composable/cartridge/scripts/helpers/shopperBaskets/getBasketHelper.js")
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;
var Status = require("dw/system/Status");
exports.modifyGETResponse = function (basket : dw.order.Basket, basketResponse : Basket) {
    try {
        getBasketHelper.handleModify(basketResponse,basket);
        request.custom.optimized = true;
        return new Status(Status.OK);
    }
    catch (e){
        logHandler.logger.error(e, 'Hooks', 'getBasketModify');
        return new Status(Status.ERROR);
    }
}
