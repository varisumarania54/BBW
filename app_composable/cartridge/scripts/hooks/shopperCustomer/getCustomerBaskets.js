'use strict';
var getBasketHelper = require("app_composable/cartridge/scripts/helpers/shopperBaskets/getBasketHelper.js")
var Status = require("dw/system/Status");
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;
const basketMgr = require('dw/order/BasketMgr');

exports.modifyGETResponse_v2 = function (customer: dw.customer.Customer, customerBasketsResultResponse: BasketsResult) {
    try {
        if (!empty(customerBasketsResultResponse.baskets) && request.SCAPI) {
            // BE-668: Multiple baskets detected
            if (customerBasketsResultResponse.baskets.length > 1) {
                logHandler.logger.warn('BE-668: Multiple baskets detected - count: ' + customerBasketsResultResponse.baskets.length + ', customerNo: ' + (customer && customer.profile ? customer.profile.customerNo : 'anonymous'), 'Hooks', 'BasketsModify');
            }
            if (!empty(customerBasketsResultResponse.baskets)) {
                const currentBasket = basketMgr.getCurrentBasket();
                if (!empty(currentBasket)) {
                    getBasketHelper.handleModify(customerBasketsResultResponse.baskets[0], currentBasket);
                }
                else{
                    let basketId = customerBasketsResultResponse.baskets[0].basketId;
                    const tempBasket = basketMgr.getTemporaryBasket(basketId);
                    if (!empty(tempBasket)) {
                        getBasketHelper.handleModify(customerBasketsResultResponse.baskets[0], tempBasket);
                    }
                    else{
                        const storedBasket = basketMgr.getStoredBasket();
                        if(!empty(storedBasket) && storedBasket.UUID === basketId){
                            getBasketHelper.handleModify(customerBasketsResultResponse.baskets[0], storedBasket);
                        }
                    }
                }
            }
        }
        request.custom.optimized = true;
        return new Status(Status.OK);
    }
    catch (e) {
        logHandler.logger.error(e, 'Hooks', 'BasketsModify');
        return new Status(Status.ERROR);
    }
}
