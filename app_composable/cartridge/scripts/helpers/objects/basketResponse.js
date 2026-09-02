'use strict';

/**
 * @namespace BasketResponse
 */
const ShippingHelpers = require('app_composable/cartridge/scripts/helpers/global/Shipping.js');
const basketHelper = require('app_composable/cartridge/scripts/helpers/objects/basket.js');
const messageBanner = require('app_composable/cartridge/scripts/helpers/objects/BasketComponents/cartMessaging.js');
const BopisOrderLimits = require('app_composable/cartridge/scripts/helpers/global/BopisOrderLimits.js');
const ShipmentHelper = require('app_composable/cartridge/scripts/helpers/objects/shipment.js');
const CouponHelper = require('app_composable/cartridge/scripts/helpers/objects/coupon.js');
const CouponMgr = require('dw/campaign/CouponMgr');
const Site = require('dw/system/Site').getCurrent();
const Money = require('dw/value/Money');
const PromotionMgr = require('dw/campaign/PromotionMgr');
const productHelper = require('app_composable/cartridge/scripts/helpers/objects/product.js');
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;
const BopisHelper = require('app_composable/cartridge/scripts/helpers/objects/BasketComponents/BopisHelper.js');
const Resource = require('dw/web/Resource');
const sitePrefHelper = require('app_composable/cartridge/scripts/helpers/util/sitePrefHelper');
/**
 * Sets the data on the basket response needed for shipping surcharge messaging
 * @function addShippingSurchargeData
 * @memberof BasketResponse
 * @param {BasketsResult} basketResponse
 * @param {Baskets} basket : customer basket
 * @param {String} storeid : preferred store id
 */
function addShippingSurchargeData(basketResponse, basket, storeid) {
    const surchargeData = ShippingHelpers.getApplicableShippingPriceing();
    const shippingShipment = getShippingShipment(basketResponse);
    const BOPISShipments = getBopisShipments(basketResponse);
    if (!empty(shippingShipment) && !empty(shippingShipment.shippingMethod) && !empty(surchargeData)) {
        const nonGCProductLineItems = basket.productLineItems.toArray().filter(e => e.shipment.ID === shippingShipment.shipmentId && (empty(e.product.custom.isGiftCard) || !e.product.custom.isGiftCard));
        if (nonGCProductLineItems.length > 0) {
            const currentShipCost = nonGCProductLineItems.reduce((a, b) => a.add(b.getAdjustedNetPrice()), new Money(0, basket.getCurrencyCode())).value;
            const surchargeHit = surchargeData[shippingShipment.shippingMethod.id];
            const threshold = !empty(surchargeHit) ? surchargeHit.find(e => e.threshold > currentShipCost) : null;
            if (!empty(threshold)) {
                let pgcli = basket.productLineItems.toArray().filter(e => e.custom.isGiftCard && !e.custom.isVirtual);
                let gcAddition = 0;
                if (!empty(pgcli)) {
                    gcAddition = pgcli.reduce((a, b) => a.add(!empty(b.shippingLineItem) ? b.shippingLineItem.adjustedPrice : new Money(0, basket.getCurrencyCode())), new Money(0, basket.getCurrencyCode())).value;
                }
                basketResponse.c_costToAdd = (threshold.threshold - currentShipCost).toFixed(2);
                basketResponse.c_costOfDiscount = (threshold.price + gcAddition).toFixed(2);
            }
        }
    }
    let basketType = !empty(BOPISShipments) && !empty(shippingShipment) ? 'MIXED' : !empty(BOPISShipments) ? 'BOPIS' : 'STH';
    if (basketType === 'MIXED' || basketType === 'STH') {
        let dbShippingShipment = basket.shipments.toArray().find(e => e.ID == shippingShipment.shipmentId);
        if (dbShippingShipment.productLineItems.toArray().every(e => e.custom.isVirtual) && dbShippingShipment.giftCertificateLineItems.toArray().every(e => e.custom.isVirtual)) {
            basketType = !empty(BOPISShipments) ? 'BOPIS' : 'EGC';
        }
    }
    basketResponse.c_basketType = basketType
    basketResponse.c_bopisAvailable = basketType === 'MIXED' || basketType === 'BOPIS' ? true : isBopisAvailableInBasket(basket, storeid)
    addSurchargeMessage(basketResponse);
}

/**
 * Adds a surcharge message to the basket response if applicable.
 * The surcharge message is added when the basket contains a shipping surcharge
 * and the basket type is either 'MIXED' or 'STH'.
 *
 * @function addSurchargeMessage
 * @memberof BasketResponse
 * @param {Object} basketResponse - The basket response object to update.
 */
function addSurchargeMessage(basketResponse) {
    if (!empty(basketResponse.c_costToAdd) && !empty(basketResponse.c_costOfDiscount) && (basketResponse.c_basketType == 'MIXED' || basketResponse.c_basketType == 'STH')) {
        basketResponse.c_surchargeMessage = dw.util.StringUtils.format(Site.getCustomPreferenceValue('shippingSurchargeMessage'), basketResponse.c_costToAdd, basketResponse.c_costOfDiscount);
    }
}

/**
 * Determines if the current basket state could be bopis
 * @function isBopisAvailableInBasket
 * @memberof BasketResponse
 * @param {Basket} basket : customer basket
 * @param {String} storeid : preferred store id
 * @return {Boolean} true if bopis is available. Otherwise false.
 */
function isBopisAvailableInBasket(basket, storeid) {
    if (!sitePrefHelper.getSitePrefValue('enableStorePickUp')) {
        return false;
    }
    return basket.getProductLineItems().toArray().some(lineItem => {
        let storeLowerQty = !empty(lineItem.custom.storeInventory) ? lineItem.custom.storeInventory : BopisOrderLimits.getStoreInventoryLimit(lineItem.product.ID, storeid);
        let isProductAvailableinStore = (storeLowerQty >= lineItem.quantity.value);

        if (isProductAvailableinStore)
            return isProductAvailableinStore;
    });
    // if(session.custom.isInventoryAllocationQtyLesser && InventoryAllocateHelper.isRespectAllocateEnabled()){
    //     var allocationResponse = InventoryAllocateHelper.getPreviousAllocationResult();

    //     if(!empty(lineItem.product.ID) && !empty(allocationResponse) && allocationResponse.hasInventoryAllocationQty && !empty(allocationResponse.inventoryAllocateQtyISPU) && !empty(allocationResponse.inventoryAllocateQtyISPU[lineItem.product.ID]) && allocationResponse.inventoryAllocateQtyISPU[lineItem.product.ID] > 0){
    //         isProductAvailableinStore = true;
    //     }
    // }
}

/**
 * Sets the data on the basket response needed for cart level messaging
 * @function addCartLevelMessaging
 * @memberof BasketResponse
 * @param {BasketsResult} basketResponse
 * @param {Baskets} basket customer basket
 */
function addCartLevelMessaging(basketResponse, basket) {
    let banners = [];
    const errorMessage = messageBanner.getBasketErrorBanner(basket, basketResponse);
    if (!empty(errorMessage)) {
        banners.push(errorMessage);
    }

    let approachingDiscount = messageBanner.getApproachingOrderAndShippingDiscountBanner(basket);
    if (approachingDiscount) {
        approachingDiscount.forEach(e => {
            if (!empty(e)) {
                banners.push(e);
            }
        });
    }

    const couponMessage = messageBanner.getCouponNotQualifiedBanner(basket);
    if (!empty(couponMessage)) {
        banners.push(couponMessage);
    }

    const freeItemMessage = messageBanner.getFreeItemBanner(basket);
    if (!empty(freeItemMessage)) {
        banners.push(freeItemMessage);
    }

    if (sitePrefHelper.getSitePrefValue('enableStorePickUp')) {
        const bopisMessage = messageBanner.getBopisBanner(basket, basket.custom.preferredStore);
        if (!empty(bopisMessage)) {
            banners.push(bopisMessage);
        }
    }

    const OGBanner = messageBanner.getOGLoginRequiredBanner(basket);
    if (!empty(OGBanner)) {
        banners.push(OGBanner);
    }

    if (request.custom.itemRemoved) {
        banners.push(messageBanner.getItemRemovedMessage());
    }

    if (!empty(basket.custom.dissmisableBannerMessages)) {
        basket.custom.dissmisableBannerMessages.forEach((msgID) => {
            let banner = null;
            switch (msgID) {
                case 'couponFieldHidden':
                    banner = messageBanner.getHiddenCouponInputMessage()
                    break;
                case 'Merge':
                    const mergedBanner = messageBanner.getCartMergeBanner(basket);
                    if (!empty(mergedBanner)) {
                        banners.push(mergedBanner);
                    }
                    break;
                case 'expiredCouponRemoved':
                    const expCouoponRemovedBanner = messageBanner.getExpiredCouponRemovedMessage()
                    if(!empty(expCouoponRemovedBanner)){
                        banners.push(expCouoponRemovedBanner);
                    }
                    break;
                default:
                    break;
            }
            if (!empty(banner)) {
                banners.push(banner);
            }
        })
    }
    if (!empty(banners)) {
        basketResponse.c_banners = banners;
    }
}

function addPLILevelMessaging(basketResponse, basket) {
    basketResponse.productItems.toArray().forEach(productItem => {
        if (productItem.c_storeInventory == 0 && productItem.c_webInventory == 0) {
            productItem.c_pliMessage = Resource.msg('item.outofstock.online_pickup', 'cart', null);
        }
        // Check if quantity equals purchase limit
        else if (request.custom.reason == "purchaseLimitReached" && !request.custom.basketLimitOverride && request.custom.lineId == productItem.itemId) {
            productItem.c_pliMessage = Resource.msg('item.purchaselimit.overindividuallimit', 'cart', null);
        }
        else if(request.custom.reason == "purchaseLimitReached" && request.custom.basketLimitOverride &&  request.custom.limit &&  request.custom.categoryName && request.custom.lineId == productItem.itemId) {
            productItem.c_pliMessage = dw.util.StringUtils.format(Site.getCustomPreferenceValue('basketLimitInlineCartError'), "'", request.custom.limit, request.custom.categoryName);
        }
        else if (empty(productItem.c_fromStoreId) && productItem.c_webInventory == 0) {
            //Out of stock online. Switch to pickup.
            productItem.c_pliMessage = Resource.msg('item.outofstock.online', 'cart', null);
        } else if (!empty(productItem.c_fromStoreId)) {
            //no inventory current store but has inventory in near by stores
            if(Site.getCustomPreferenceValue('AllBopisStoresUnavailable') || !sitePrefHelper.getSitePrefValue('enableStorePickUp')){
            //Bopis Off
                productItem.c_pliMessage = Resource.msg('item.unavailable.pickup.bopisoff','cart',null);
                return
            }
            if(productItem.c_storeInventory == 0){
                productItem.c_pliMessage = Resource.msg('item.outofstock.pickup','cart',null);
            }
            //current store turned off/ not available
            if(!BopisOrderLimits.isBopisStoreAvailable(productItem.c_fromStoreId)){
                productItem.c_pliMessage = Resource.msg('item.unavailable.pickup.storeoff','cart',null);
            }
            //no inventory current store or near by stores
            else if (!empty(productItem.c_hasInvInNearbyStores) && !productItem.c_hasInvInNearbyStores) {
                productItem.c_pliMessage = Resource.msg('item.outofstock.pickup.nostore', 'cart', null);
            }
            //current store turned off/ not available
            else if (!BopisOrderLimits.isBopisStoreAvailable(productItem.c_fromStoreId)) {
                productItem.c_pliMessage = Resource.msg('item.unavailable.pickup.storeoff', 'cart', null);
            }
            else if (productItem.c_storeInventory == 0) {
                productItem.c_pliMessage = Resource.msg('item.outofstock.pickup', 'cart', null);
            }
        }
        if (!empty(productItem.c_pliMessage) && !empty(productItem.c_bonusLineItems)) {
            productItem.c_bonusLineItems.forEach(bonusItem => {
                bonusItem.c_pliMessage = productItem.c_pliMessage;
            });
        }
    })
}

/**
 * Reorders the cart response product items
 * @function reOrderCartResponse
 * @memberof BasketResponse
 * @param {BasketsResult} basketResponse
 */
function reOrderCartResponse(basketResponse) {
    var shippingShipment = getShippingShipment(basketResponse);
    var shippingShipmentID = !empty(shippingShipment) ? shippingShipment.shipmentId : '';
    var BOPISShipments = getBopisShipments(basketResponse);
    var BOPISShipmentIDs = !empty(BOPISShipments) ? BOPISShipments.map(e => e.shipmentId) : [];
    var shippingItems = !empty(shippingShipmentID) ? basketResponse.productItems.toArray().filter(e => shippingShipmentID === e.shipmentId) : [];
    var bopisItems = !empty(BOPISShipmentIDs) ? basketResponse.productItems.toArray().filter(e => BOPISShipmentIDs.includes(e.shipmentId)) : [];
    shippingItems.sort(pliOrderCompare);
    bopisItems.sort(pliOrderCompare);
    basketResponse.productItems = new dw.util.ArrayList(shippingItems.concat(bopisItems));
}

/**
 * returns -1 if a.price> b.price
 * returns 1 if a.price< b.price
 * returns 0 if a.price= b.price
 * @function pliOrderCompare
 * @memberof BasketResponse
 * @param {Object} a
 * @param {Object} b
 */
function pliOrderCompare(a, b) {
    if (a.price > b.price) {
        return -1;
    } else if (a.price < b.price) {
        return 1;
    } else {
        return 0;
    }

}

/**
 * returns the shipping shipment from the basket response
 * @function getShippingShipment
 * @memberof BasketResponse
 * @param {BasketsResult} basketResponse
 */
function getShippingShipment(basketResponse) {
    if (!empty(basketResponse.shipments)) {
        return basketResponse.shipments.toArray().find(e => empty(e.c_fromStoreId) && empty(e.c_shipmentType));
    }
    return [];
}

/**
 * returns the BOPIS shipment from the basket response
 * @function getBopisShipments
 * @memberof BasketResponse
 * @param {BasketsResult} basketResponse
 */
function getBopisShipments(basketResponse) {
    if (!empty(basketResponse.shipments)) {
        return basketResponse.shipments.toArray().filter(e => !empty(e.c_fromStoreId) && !empty(e.c_shipmentType));
    }
    return [];
}

/**
 * Builds "fake" line items based on the diffrent compound price adjustments applied to the line. Also moves the price adjustment from the parent
 * items to the new "fake item"
 * @function buildFakeProductLineItemsByDiscount
 * @memberof BasketResponse
 * @param {BasketsResult} basketResponse
 * @param {Basket} basket
 */
function buildFakeProductLineItemsByDiscount(basketResponse, basket) {
    basketResponse.productItems.toArray().forEach(productItem => {
        let pli = basketHelper.getExsistingLineItemInCart(productItem.productId, basket, productItem.c_fromStoreId, false);
        if (!empty(pli)) {
            productItem.c_discountUnitPrice = pli.basePrice.getValue();
            if (!empty(pli.priceAdjustments)) {
                let newLineItems = [];
                let lineQtyTotal = pli.getQuantityValue();
                let appliesToAllPA = [];
                pli.priceAdjustments.toArray().sort((a, b) => b.quantity - a.quantity).forEach(pa => {
                    if (pa.quantity > 0 && pa.quantity < lineQtyTotal) {
                        let itemCopy = {};
                        //Build Fake
                        itemCopy.c_mockLineItem = true;
                        itemCopy.priceAdjustment = removePriceAdjustment(productItem, pa.getUUID());
                        itemCopy.quantity = pa.quantity;
                        itemCopy.originalUnitPrice = pli.basePrice.getValue();
                        itemCopy.discountUnitPrice = pli.basePrice.subtract(pa.netPrice.multiply(-1).divide(pa.quantity)).getValue();
                        itemCopy.priceAfterItemDiscount = pli.basePrice.subtract(pa.netPrice.multiply(-1).divide(pa.quantity)).multiply(pa.quantity).getValue();
                        lineQtyTotal = lineQtyTotal - pa.quantity
                        let standardPrice = productHelper.getProductStandardPrice(pli.product);
                        itemCopy.price = new dw.value.Money(standardPrice, pli.adjustedPrice.currencyCode).multiply(itemCopy.quantity).getDecimalValue().valueOf();
                        itemCopy.basePrice = new dw.value.Money(standardPrice, pli.adjustedPrice.currencyCode).getDecimalValue().valueOf();
                        //Update Real
                        productItem.c_mockLineItem = false;
                        productItem.quantity = lineQtyTotal;
                        productItem.price = pli.basePrice.multiply(lineQtyTotal).getValue();
                        productItem.priceAfterItemDiscount = new Money(productItem.priceAfterItemDiscount, pli.basePrice.currencyCode).subtract(new Money(itemCopy.priceAfterItemDiscount, pli.basePrice.currencyCode)).getValue()
                        appliesToAllPA.forEach(priceAdj => {
                            itemCopy.discountUnitPrice = new Money(itemCopy.discountUnitPrice, pli.basePrice.currencyCode).add(priceAdj.basePrice.divide(priceAdj.quantity)).getValue();
                            itemCopy.priceAfterItemDiscount = new Money(itemCopy.priceAfterItemDiscount, pli.basePrice.currencyCode).add(priceAdj.basePrice.divide(priceAdj.quantity)).getValue()
                        })
                        getUnitPriceAfterAllDiscounts(pli, itemCopy);
                        newLineItems.push(itemCopy);
                    }
                    else if (!empty(productItem.priceAdjustments)) {
                        let paQuantity = pa.quantity === 0 ? pli.quantity.value : pa.quantity; // Code created promos have no quantity
                        productItem.c_discountUnitPrice = new Money(productItem.c_discountUnitPrice, basket.currencyCode).subtract(pa.netPrice.multiply(-1).divide(paQuantity)).getValue();
                        appliesToAllPA.push(pa);
                    }
                });
                if (!empty(appliesToAllPA)) {
                    let basePrice = pli.basePrice;
                    appliesToAllPA.forEach(pa => {
                        let paQuantity = pa.quantity === 0 ? pli.quantity.value : pa.quantity; // Code created promos have no quantity
                        let discountPerUnit = pa.netPrice.divide(paQuantity);
                        basePrice = basePrice.add(discountPerUnit);
                    })
                    productItem.priceAfterItemDiscount = basePrice.multiply(productItem.quantity).getValue();
                }
                productItem.c_bonusLineItems = newLineItems;
            }
            getUnitPriceAfterAllDiscounts(pli, productItem);
        }
    });
}

/**
 * Calculates and sets the unit and line price after all discounts for a product item.
 * Applies prorated order-level adjustments and bonus line item logic.
 *
 * @function getUnitPriceAfterAllDiscounts
 * @memberof BasketResponse
 * @param {dw.order.ProductLineItem} pli - The product line item from the basket.
 * @param {Object} productItem - The basket response product item object to update.
 */
function getUnitPriceAfterAllDiscounts(pli, productItem) {
    if (Site.getCustomPreferenceValue('runAfterOrderDiscountLogicOnBasket')) {
        try {
            let discountUnitVariable = 'discountUnitPrice' in productItem ? 'discountUnitPrice' : 'c_discountUnitPrice';
            if (productItem[discountUnitVariable] == 0) {
                productItem.c_unitPriceAfterOrderDiscount = productItem[discountUnitVariable];
                productItem.c_linePriceAfterOrderDiscount = productItem.priceAfterItemDiscount.valueOf();
            }
            else {
                let freeQty = !empty(productItem.c_bonusLineItems) ? productItem.c_bonusLineItems.reduce((acc, item) => acc + item.discountUnitPrice == 0 ? item.quantity : 0, 0) : 0;
                let proratedAdjustmentsMap = pli.getProratedPriceAdjustmentPrices();
                let proratedOrderAdjustments = proratedAdjustmentsMap.keySet().toArray().filter(e => !empty(e.promotion) && e.promotion.promotionClass == dw.campaign.Promotion.PROMOTION_CLASS_ORDER);
                let c_unitPriceAfterOrderDiscount = productItem[discountUnitVariable];
                var c_linePriceAfterOrderDiscount = productItem.priceAfterItemDiscount.valueOf();
                proratedOrderAdjustments.forEach(pa => {
                    let proratedUnitAmount = proratedAdjustmentsMap.get(pa).value / (pli.quantity.value - freeQty);
                    c_unitPriceAfterOrderDiscount = new Money(c_unitPriceAfterOrderDiscount + proratedUnitAmount, pli.basePrice.currencyCode).getValue();
                    c_linePriceAfterOrderDiscount = new Money(c_linePriceAfterOrderDiscount + (proratedUnitAmount * productItem.quantity), pli.basePrice.currencyCode).getValue();
                });
                let bonusLineTotal = 0;
                if (!empty(productItem.c_bonusLineItems)) {
                    bonusLineTotal = productItem.c_bonusLineItems.reduce((acc, item) => acc + item.c_linePriceAfterOrderDiscount, 0);
                }
                let remainder = productItem.priceAfterOrderDiscount - bonusLineTotal - c_linePriceAfterOrderDiscount;
                c_linePriceAfterOrderDiscount = Math.abs(remainder) > 0 ? productItem.priceAfterOrderDiscount - bonusLineTotal : c_linePriceAfterOrderDiscount;
                productItem.c_unitPriceAfterOrderDiscount = productItem.quantity == 1 ? c_linePriceAfterOrderDiscount : c_unitPriceAfterOrderDiscount;
                productItem.c_linePriceAfterOrderDiscount = c_linePriceAfterOrderDiscount;
            }
        }
        catch (e) {
            logHandler.logger.error(e, 'Hooks', 'getBasketModify');
        }
    }
}

/**
 * removes the matching price adjustment object from productItem and returns it.
 * @function removePriceAdjustment
 * @memberof BasketResponse
 * @param {productItem} productItem
 * @param {String} priceAdjustmentId
 */
function removePriceAdjustment(productItem, priceAdjustmentId) {
    var removedPA = productItem.priceAdjustments.toArray().find(e => e.priceAdjustmentId === priceAdjustmentId);
    let promotion = removedPA.promotionId.indexOf('OG-Promo') > -1 ? null : PromotionMgr.getPromotion(removedPA.promotionId);
    removedPA.c_showItemName = !empty(promotion) && !empty(promotion.name);
    removedPA.c_calloutMessage = !empty(promotion.calloutMsg) ? promotion.calloutMsg.markup : "";
    removedPA.c_promotionDetails = !empty(promotion.details) ? promotion.details.markup : "";
    productItem.priceAdjustments = new dw.util.ArrayList(productItem.priceAdjustments.toArray().filter(e => e.priceAdjustmentId !== priceAdjustmentId));
    return removedPA;
}

/**
 * Attaches promo messaging to the couponItems within the response.
 * @function attachPromoInfoToCouponItems
 * @memberof BasketResponse
 * @param {BasketsResult} basketResponse
 * @param {Basket} basket
 */
function attachPromoInfoToCouponItems(response, basket) {
    if (!empty(response.couponItems)) {
        response.couponItems = response.couponItems.toArray().map(e => {
            var couponLineItem = basket.couponLineItems.toArray().find(f => f.applied && f.couponCode == e.code);
            if (!empty(couponLineItem) && !empty(couponLineItem.priceAdjustments)) {
                e.c_promoNames = Array.from(new Set(couponLineItem.priceAdjustments.toArray().map(f => (f.promotion ? f.promotion.name : null))));
            }
            let coupon = CouponMgr.getCouponByCode(e.code);
            let couponType = coupon ? CouponHelper.getCouponType(coupon.ID) : '';

            e.c_type = couponType;
            return e;
        });
    }
}

/**
 * Attaches hazmat items array and non hazmat restricted items to the basket.
 * @function getShippingRestrictedItems
 * @memberof BasketResponse
 * @param {BasketsResult} basketResponse
 * @param {Basket} basket
 */
function getShippingRestrictedItems(response, basket) {
    let shippingShipment = basketHelper.getShipment(basket);
    response.c_hazmatItems = !empty(shippingShipment) ? ShipmentHelper.getHazmatRestrictedItems(shippingShipment) : [];
    response.c_nonHazmatRestrictedItems = !empty(shippingShipment) ? ShipmentHelper.getNonHazmatRestrictedItems(shippingShipment) : [];
}

/**
 * Attaches BBW subtotal to the basket.
 * @function handleCustomSubTotal
 * @memberof BasketResponse
 * @param {BasketsResult} basketResponse
 * @param {Basket} basket
 */
function handleCustomSubTotal(response, basket) {
    let subTotal = basket.getAdjustedMerchandizeTotalPrice(false).add(basket.giftCertificateTotalPrice);
    subTotal = subTotal.subtract(basketHelper.getBagFeeTotal(basket));
    subTotal = subTotal.subtract(basketHelper.getGiftBoxTotal(basket));
    response.c_subTotal = subTotal.getValue();
}

/**
 * Sets basket purchase limit data on the response when the purchase limit has been reached.
 * @function setBasketLimitResponseData
 * @memberof BasketResponse
 * @param {Object} response - The basket response object to update.
 */
function setBasketLimitResponseData(response) {
    if (request.custom.reason == 'purchaseLimitReached') {
        response.c_basketLimitData = request.custom.bagLimitData;
    }
}

/**
 * Sets a result message on the basket response when the purchase limit has been reached.
 * Sets c_result to 'LIMITHIT' to signal to the client that the basket limit was exceeded.
 * @function addBasketResultMessage
 * @memberof BasketResponse
 * @param {Object} response - The basket response object to update.
 */
function addBasketResultMessage(response){
    if (request.custom.reason == "purchaseLimitReached") {
        response.c_result = 'LIMITHIT';
    }
}

module.exports = {
    addShippingSurchargeData,
    addCartLevelMessaging,
    reOrderCartResponse,
    buildFakeProductLineItemsByDiscount,
    attachPromoInfoToCouponItems,
    getShippingRestrictedItems,
    handleCustomSubTotal,
    setBasketLimitResponseData,
    addPLILevelMessaging,
    addBasketResultMessage
};
