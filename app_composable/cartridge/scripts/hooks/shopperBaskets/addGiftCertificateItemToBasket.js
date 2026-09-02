'use strict';
const helper = require('app_composable/cartridge/scripts/helpers/shopperBaskets/addGiftCertificateItemToBasketHelper.js')
const addItemToBasketHelper = require('app_composable/cartridge/scripts/helpers/shopperBaskets/addItemToBasketHelper.js');
const getBasketHelper = require("app_composable/cartridge/scripts/helpers/shopperBaskets/getBasketHelper.js")
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;
const Status = require("dw/system/Status");
const validationsUtil = require('app_composable/cartridge/scripts/helpers/util/validationsUtil');
const orderAddress = require('app_composable/cartridge/scripts/helpers/objects/orderAddress.js');

exports.beforePOST = function(basket : dw.order.Basket, item : GiftCertificateItem) {

    validationsUtil.validateRequestBody('Basket-Attributes');
    const product = dw.catalog.ProductMgr.getProduct(item.c_productID)
    if(!helper.inputIsValid(item,product) || !helper.checkInv(basket, product)){
        return new dw.system.Status(dw.system.Status.ERROR, '400', request.custom.error )
    }
    item.message = orderAddress.sanitizeString(item.message);
    item.c_isVirtual = product.custom.isVirtual;
    item.c_productImage =helper.getGCImageUrl(product, 'crop');
    item.c_productName = product.name;
    addItemToBasketHelper.buildOrGetShipment(basket, item);
    if(!product.custom.isVirtual){
        item.recipientEmail = "tmp@email.com";
    }
}
exports.afterPOST = function(basket : dw.order.Basket, item : GiftCertificateItem) {
    if(!empty(basket.giftCertificateLineItems)){
        var gcli = basket.giftCertificateLineItems[basket.giftCertificateLineItems.length -1]
        gcli.custom.isVirtual =item.c_isVirtual;
        gcli.custom.productImage = item.c_productImage;
        gcli.giftCertificateID = item.c_productID;
        gcli.setLineItemText(item.c_productName);
    }
}

exports.modifyPOSTResponse = function(basket : dw.order.Basket, basketResponse : Basket, couponRequest : CouponItem){
    try {
        getBasketHelper.handleModify(basketResponse,basket);
        return new Status(Status.OK);
    }
    catch (e){
        logHandler.logger.error(e, 'Hooks', 'addGCLI');
        return new Status(Status.ERROR);
    }
}
