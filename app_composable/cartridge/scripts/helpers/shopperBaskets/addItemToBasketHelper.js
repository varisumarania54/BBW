/**
 * @module addItemToBasketHelper.js
 */
'use strict';

const StoreMgr = require('dw/catalog/StoreMgr');
const UUIDUtils = require('dw/util/UUIDUtils');
const shippingMgr = require('dw/order/ShippingMgr');
const ProductMgr = require('dw/catalog/ProductMgr');
const stringUtils = require('dw/util/StringUtils');
const ProductInventoryMgr = require('dw/catalog/ProductInventoryMgr');

const InvService = require('app_composable/cartridge/scripts/helpers/integrations/inventory/ExternalInventory.js');
const purchaseLimitHelper = require('app_composable/cartridge/scripts/helpers/global/BopisOrderLimits.js');
const basketHelper = require('app_composable/cartridge/scripts/helpers/objects/basket.js')
const productHelper = require('app_composable/cartridge/scripts/helpers/objects/product.js')
const ForceSoldOutHelper = require('app_composable/cartridge/scripts/helpers/global/ForceSoldOutHelper.js');
const orderAddress = require('app_composable/cartridge/scripts/helpers/objects/orderAddress.js');

const Site = require('dw/system/Site').getCurrent();


/**
 * Checks For c_set_qty header flag and updates the item quantity
 * to correct in the instance we are trying to not be additive
 * @function setQtyWork
 * @memberof addItemToBasketHelper
 * param {ProductItem} item SFCC item object passed in request
 * param {ProductLineItem} pli SFCC item object
 */
function setQtyWork(item, pli) {
    let setQtyFlag = !empty(item.c_set_qty) ? item.c_set_qty : false;
    if (setQtyFlag) {
        item.quantity = item.quantity - pli.quantity;
    }
}

/**
 * Handle logic to remove a exsisting pli from the basket when 0 qty is passed
 * @function zeroQuantityPassed
 * @memberof addItemToBasketHelper
 * param {Basket} basket current user's basket
 * param {ProductItem} item SFCC item object passed in request
 * param {ProductLineItem} pli Exsisting product line item on basket
 * return true(if item was removed) otherwise false
 */
function zeroQuantityPassed(basket, item, pli) {
    if (item.quantity == 0) {
        if (!empty(pli)) {
            basket.removeProductLineItem(pli);
            return true;
        }
    }
    return false;
}


/**
 * Assigns inventory list id to item in basket if bopis
 * @function assignInventoryId
 * @memberof addItemToBasketHelper
 * param {Basket} basket current user's basket
 * param {ProductItem} item SFCC item object passed in request
 */
function assignInventoryId(basket, item) {
    if (!empty(item.c_fromStoreId)) {
        let store = StoreMgr.getStore(item.c_fromStoreId);
        const storeInv = purchaseLimitHelper.getStoreInventoryList(store);
        if (!empty(storeInv)) {
            item.inventoryId = storeInv.ID;
        }
    } else {
        item.inventoryId = ProductInventoryMgr.getInventoryList().ID;
        item.c_fromStoreId = null;
    }
}

/**
 * Kicks off other methods required for purchase limit based on the target total for the basket
 * @function purchaseLimitWork
 * @memberof addItemToBasketHelper
 * param {Basket} basket current user's basket
 * param {ProductItem} item SFCC item object passed in request
 * param {ProductLineItem} pli Exsisting product line item on basket or null
 */
function purchaseLimitWork(basket, item, pli, update) {
    let targetTotal = !empty(pli) && !update ? item.quantity + pli.quantity : item.quantity;
    targetTotal = hasInventory(item, targetTotal, pli);
    const limitData = basketHelper.getBasketLimitData(basket);
    withinPurchaseLimits(item, targetTotal, pli, limitData, update);
}

/**
 * Gets purchase limit and update item quantity to reflect
 * Also sets a quantityAdded field on the request and a flag for if a purchase limit was reached
 * @function withinPurchaseLimits
 * @memberof addItemToBasketHelper
 * param {ProductItem} item SFCC item object passed in request
 * param {Number} targetTotal The target number we want to end at for the item in the basket
 * param {ProductLineItem} pli Exsisting product line item on basket or null
 */
function withinPurchaseLimits(item, targetTotal, pli, limitData, update) {
    const product = empty(pli) ? ProductMgr.getProduct(item.productId) : pli.product;
    let limit = purchaseLimitHelper.getPurchaseLimit(product, item.c_fromStoreId);
    if (Site.getCustomPreferenceValue('basketLimitEnabled')) {
        const basketLimitJson = Site.getCustomPreferenceValue('BasketLimits');
        const basketLimitObj = !empty(basketLimitJson) ? JSON.parse(basketLimitJson) : null;
        let basketLimit = !empty(basketLimitObj) && !empty(product.primaryCategory) ? basketLimitObj[product.primaryCategory.ID] : null;
        if (!empty(basketLimit)) {
            let basketCategoryData = limitData.basket[product.primaryCategory.ID];
            let currentBasketCount = !empty(basketCategoryData) ? basketCategoryData.quantity : 0;
            let artificialBasketLimit = pli ? basketLimit - currentBasketCount + pli.quantity : basketLimit - currentBasketCount;
            limit = limit > artificialBasketLimit ? artificialBasketLimit : limit;
            request.custom.basketLimitOverride = true;
            request.custom.categoryID = product.primaryCategory.ID;
            request.custom.categoryName = product.primaryCategory.displayName;
            request.custom.limit = basketLimit;
        }
    }
    if (!empty(limit) && targetTotal > limit) {
        request.custom.reason = "purchaseLimitReached";
        request.custom.lineId = !empty(pli) ? pli.UUID : null;
        if (!empty(pli) && pli.quantity < limit) {
            const itemHitLimit = {}
            const basketLimitData = JSON.parse(request.custom.bagLimitData) || []
            item.quantity = update ? limit : limit - pli.quantity;
            itemHitLimit[item.productId] = {
                category:product.primaryCategory.ID,
                quantityAdded : Number(item.quantity),
                requestedQuantity : targetTotal
            }
            basketLimitData.push(itemHitLimit)
            request.custom.bagLimitData = JSON.stringify(basketLimitData);
        }
        else if (!empty(pli) && pli.quantity == limit) {
            item.quantity = 0;
            request.custom.quantityAdded = 0;
            request.custom.zeroWasAdded = true;
        }
        else if (!empty(pli) && pli.quantity > limit && update) {
            item.quantity = pli.quantity.value > item.quantity ? item.quantity : pli.quantity.value;
            request.custom.quantityAdded = item.quantity - pli.quantity.value;
        }
        else if (!empty(pli) && pli.quantity > limit && !update) {
            item.quantity = 0;
            request.custom.quantityAdded = 0;
        }
        else {
            item.quantity = limit;
            request.custom.quantityAdded = limit;
        }
    }
}

/**
 * Gets inventory for the requested item and sets the qty on the item to the max availabe or 0 if none is available
 * @function hasInventory
 * @memberof addItemToBasketHelper
 * param {ProductItem} item SFCC item object passed in request
 * param {Number} targetTotal The target number we want to end at for the item in the basket
 * return {Number} orinal target total or motified one due to inventory constraints
*/
function hasInventory(item, targetTotal, pli) {
    let qtyInCart = !empty(pli) ? pli.quantity : 0;

    const product = empty(pli) ? ProductMgr.getProduct(item.productId) : pli.product;

    //only check for force sold out if it is STM and not BOPIS
    if (item.c_fromStoreId == null && ForceSoldOutHelper.isMarkedAsSoldOutProduct(product)) {
        item.quantity = 0;
        request.custom.quantityAdded = 0;
        request.custom.reason = "MarkedAsSoldOut";
        return 0;
    }
    let invMap = InvService.getInventoryForProducts([item.productId], [item.c_fromStoreId])
    let invEntry = !empty(item.c_fromStoreId) ? invMap.find(e => e.lineId.indexOf('ISPU') !== -1) : invMap.find(e => e.lineId.indexOf('STH') !== -1)
    let availableQty = invEntry.qty;
    if (availableQty < targetTotal) {
        request.custom.reason = "NotEnoughInventory";
        var originalQty = request.custom.originalQty;
        if (originalQty == 0 && availableQty == 0) {
            item.quantity = 0;
            request.custom.quantityAdded = 0;
            return 0;
        } else if (qtyInCart < availableQty) {
            item.quantity = availableQty - qtyInCart;
            request.custom.quantityAdded = availableQty - qtyInCart;
            return qtyInCart + item.quantity;
        } else {
            item.quantity = 0;
            request.custom.quantityAdded = 0;
            return 0;
        }
    }
    return targetTotal;
}

/**
 * Creates / Gets exsisting shipment based on Bopis/STH. Then assigns shipment id to the passed in item
 * @function buildOrGetShipment
 * @memberof addItemToBasketHelper
 * param {Basket} basket current user's basket
 * param {ProductItem} item SFCC item object passed in request
 */
function buildOrGetShipment(basket, item) {
    let shipment = basketHelper.getShipment(basket, item.c_fromStoreId);
    if (empty(shipment)) {
        let defaultShipment = basket.getDefaultShipment();
        let newShipment = defaultShipment.getProductLineItems().empty && defaultShipment.getGiftCertificateLineItems().empty ? defaultShipment : basket.createShipment(UUIDUtils.createUUID());
        if (!empty(item.c_fromStoreId)) {
            let ispuShipMethod = shippingMgr.getShipmentShippingModel(newShipment).getApplicableShippingMethods().toArray().find(e => !empty(e.custom.storePickupEnabled) && e.custom.storePickupEnabled);
            let store = StoreMgr.getStore(item.c_fromStoreId);
            let shippingAddress = newShipment.shippingAddress;
            if (shippingAddress === null) {
                shippingAddress = newShipment.createShippingAddress();
            }
            shippingAddress.setFirstName(store.name);
            shippingAddress.setLastName(' ');
            shippingAddress.setAddress1(store.address1);
            shippingAddress.setAddress2(store.address2);
            shippingAddress.setCity(store.city);
            shippingAddress.setPostalCode(store.postalCode);
            shippingAddress.setStateCode(store.stateCode);
            shippingAddress.setCountryCode(store.countryCode.value);
            shippingAddress.setPhone(store.phone);
            newShipment.custom.fromStoreId = item.c_fromStoreId;
            newShipment.custom.shipmentType = 'instore';
            newShipment.setShippingMethod(ispuShipMethod);
        }
        else {
            newShipment.setShippingMethod(shippingMgr.getDefaultShippingMethod());
            newShipment.createShippingAddress();
            let shippingCountryCode = Site.getCustomPreferenceValue('RadialShippingFromCountry');
            if(shippingCountryCode) {
                newShipment.shippingAddress.setCountryCode(shippingCountryCode);
            }
            newShipment.custom.fromStoreId = '';
            newShipment.custom.shipmentType = '';
        }
        item.shipmentId = newShipment.ID;
    }
    else {
        item.shipmentId = shipment.ID;
        if (empty(shipment.shippingMethod)) {
            shipment.setShippingMethod(shippingMgr.getDefaultShippingMethod());
        }
    }
}

/**
 * Adds required addition custom attibutes to pli
 * @function addCustomAttributesToPli
 * @memberof addItemToBasketHelper
 * c_imageURL = url of product image
 * param {Basket} basket current user's basket
 * param {ProductItem} item SFCC item object passed in request
 * param {Product} Product object within sfcc to get data from
 */
function addCustomAttributesToPli(basket, item, product) {
    let image = product.getImage('crop', 0);
    if (empty(image)) {
        image = product.getImage('hires', 0)
    }
    item.c_imageURL = !empty(image) ? image.getAbsURL().toString() : ''
    item.c_itemSize = !empty(product) ? stringUtils.decodeString(product.custom.size, 0) : null;
    item.c_itemSubtitle = !empty(product) ? stringUtils.decodeString(product.custom.form, 0) : null;
    item.c_itemName = !empty(product) ? stringUtils.decodeString(productHelper.getProductName(product), 0) : null;
    item.c_pdpProductID = 'c_masterSku' in item && !empty(item.c_masterSku) ? item.c_masterSku : product.ID;
}

/**
 * Checks if the inputed form matches bbw requirments for GC
 * @function validateGCInput
 * @memberof addItemToBasketHelper
 * @param {productItem} item : product item request object
 * @param {Product} product : the sfcc product Object associated with the GC
 * @return Status if invalid
 */
function validateGCInput(item, product) {
    if (product.custom.isGiftCard) {
        if (!Site.getCustomPreferenceValue('treatGiftCardsAsProductLineItems')) {
            return new dw.system.Status(dw.system.Status.ERROR, "400", "Invalid product");
        }
        if (!(Site.getCustomPreferenceValue("giftCardPriceValues").indexOf(String(item.c_giftCardAmount)) > -1)) {
            return new dw.system.Status(dw.system.Status.ERROR, "400", "Invalid Amount");
        }

        if (empty(item.c_giftCardRecipient)) {
            return new dw.system.Status(dw.system.Status.ERROR, "400", Resource.msg("giftcert.purchase.recipient.missing-error", 'forms', null));
        }
        if (empty(item.c_giftCardSender)) {
            return new dw.system.Status(dw.system.Status.ERROR, "400", Resource.msg('giftcert.purchase.from.missing-error', 'forms', null));
        }

        if (product.custom.isVirtual) {
            if (empty(item.c_giftCardRecipientEmail)) {
                return new dw.system.Status(dw.system.Status.ERROR, "400", Resource.msg('giftcert.purchase.from.missing-error', 'forms', null));
            }
            item.c_isVirtual = true;
        }
        item.quantity = 1;
        item.c_fromStoreId = null;
        item.c_giftCardRecipient = orderAddress.sanitizeString(item.c_giftCardRecipient);
        item.c_giftCardSender = orderAddress.sanitizeString(item.c_giftCardSender);
        item.giftMessage = orderAddress.sanitizeString(item.giftMessage);
        item.c_isGiftCard = true;
    }
}

/**
 * Cleans up OrderGroove attributes for a BOPIS (Buy Online, Pick Up In-Store) item.
 * @function cleanOGAttributes
 * @param {ProductItem} item - The item object containing BOPIS information.
 * @param {ProductLineItem} pli - The product line item associated with the order.
 * @description This function resets the OrderGroove subscription-related custom attributes
 *              on the product line item if the item is associated with a store for BOPIS.
 */
function cleanOGAttributes(item, pli) {
    if (item.c_fromStoreId || item.c_isAutoRefreshSubscribedItem === false) {
        pli.custom.orderGrooveFrequency = '';
        pli.custom.orderGrooveFrequencytime = '';
        pli.custom.isAutoRefreshSubscribedItem = false;
    }
}

module.exports = {
    zeroQuantityPassed,
    purchaseLimitWork,
    assignInventoryId,
    addCustomAttributesToPli,
    setQtyWork,
    buildOrGetShipment,
    validateGCInput,
    cleanOGAttributes
};
