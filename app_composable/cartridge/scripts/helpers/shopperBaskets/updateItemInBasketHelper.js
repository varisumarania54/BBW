'use strict';
const basketHelper = require("app_composable/cartridge/scripts/helpers/objects/basket.js")
const addItemToBasketHelper = require('app_composable/cartridge/scripts/helpers/shopperBaskets/addItemToBasketHelper.js');
const BopisOrderLimits = require('app_composable/cartridge/scripts/helpers/global/BopisOrderLimits.js');
const orderAddress = require('app_composable/cartridge/scripts/helpers/objects/orderAddress.js');
const Site = require('dw/system/Site').getCurrent();
const Resource = require("dw/web/Resource");
const ForceSoldOutHelper = require('app_composable/cartridge/scripts/helpers/global/ForceSoldOutHelper.js');

/**
 * Ensures the item is going to the right shipment and has inventory for the desired amount.
 * param basket {Basket} the current basket.
 * param item {Item} Sfcc request item object.
 * param pli {ProductLineItem} the product line item associated with the response product.
 */

function handleItemConfig(basket, item, pli) {
    item.productId = pli.product.ID;
    if (pli.product.custom.isGiftCard && item.quantity != 0) {
        validateGCInput(pli,item);
    }
    else {
        if (!empty(item.c_fromStoreId) && !BopisOrderLimits.isBopisStoreAvailable(item.c_fromStoreId)) {
            return new dw.system.Status(dw.system.Status.ERROR, "400", 'Store Not Available');
        }
        if(empty(item.c_fromStoreId) && ForceSoldOutHelper.isMarkedAsSoldOutProduct(pli.product)){
            return new dw.system.Status(dw.system.Status.ERROR, "400", 'Product is Sold Out For Online Purchase');
        }
        addItemToBasketHelper.purchaseLimitWork(basket, item, pli,true);
        addItemToBasketHelper.assignInventoryId(basket, item);
        addItemToBasketHelper.buildOrGetShipment(basket, item);
        addItemToBasketHelper.cleanOGAttributes(item, pli);
    }
}


/**
 * Alters the passed in qty of the request based on specific flags.
 * param basket {Basket} the current basket.
 * param item {Item} Sfcc request item object.
 * return {productLineItem} The current item on the basket
 */
function handleQtyManipulation(basket, item, pli) {
    //Will need added or something of its likes when supporting grid page qty selectors
    //if (!empty(item.c_pageType) && item.c_pageType === 'cart') {
    if (pli && pli.product && pli.product.custom.isGiftCard && item.quantity != 0) {
        item.quantity = 1;
    }
    else {
        let productsWithFakeLineItems = basketHelper.getLineItemsWithFakeLineItems(basket);
        let hasFakeLineItems = productsWithFakeLineItems.some(e => e.UUID == item.itemId);
        if (hasFakeLineItems) {
            const isBonusLineItem = !empty(item.c_isBonusLineItem) ? item.c_isBonusLineItem : false;
            item.quantity = isBonusLineItem ? pli.quantity - item.quantity : basketHelper.getFakeLineItemQuantity(pli) + item.quantity;
        }
    }
    //}
}

/**
 * Checks if the inputed form matches bbw requirments for GC
 * @function validateGCInput
 * @memberof addItemToBasketHelper
 * @param {productItem} item : product item request object
 * @param {Product} product : the sfcc product Object associated with the GC
 * @return Status if invalid
 */
function validateGCInput(pli, item) {
    if (pli.product.custom.isGiftCard) {
        if (!Site.getCustomPreferenceValue('treatGiftCardsAsProductLineItems')) {
            item.quantity = 0;
        }
        if (!empty(item.c_giftCardAmount) && !(Site.getCustomPreferenceValue("giftCardPriceValues").indexOf(String(item.c_giftCardAmount)) > -1)) {
            return new dw.system.Status(dw.system.Status.ERROR, "400", "Invalid Amount");
        }
        if ('c_giftCardRecipient' in item &&  empty(item.c_giftCardRecipient) && !empty(pli.custom.giftCardRecipient)) {
            return new dw.system.Status(dw.system.Status.ERROR, "400", Resource.msg("giftcert.purchase.recipient.missing-error", 'forms', null));
        }
        if ('c_giftCardSender' in item && empty(item.c_giftCardSender) && !empty(pli.custom.giftCardSender)) {
            return new dw.system.Status(dw.system.Status.ERROR, "400", Resource.msg('giftcert.purchase.from.missing-error', 'forms', null));
        }

        if (pli.product.custom.isVirtual && 'c_giftCardRecipientEmail' in item && empty(item.c_giftCardRecipientEmail) && !empty(pli.custom.giftCardRecipientEmail)) {
            return new dw.system.Status(dw.system.Status.ERROR, "400", Resource.msg('giftcert.purchase.from.missing-error', 'forms', null));
        }
        item.c_fromStoreId = null;
        item.c_giftCardRecipient = orderAddress.sanitizeString(item.c_giftCardRecipient);
        item.c_giftCardSender = orderAddress.sanitizeString(item.c_giftCardSender);
        item.giftMessage = orderAddress.sanitizeString(item.giftMessage);
    }
}


module.exports = {
    handleItemConfig,
    handleQtyManipulation
}
