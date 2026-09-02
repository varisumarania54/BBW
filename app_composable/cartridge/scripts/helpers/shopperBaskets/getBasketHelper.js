/**
 * @module getBasketHelper.js
 */
'use strict';

const Site = require('dw/system/Site').getCurrent();

const CacheMgr = require('dw/system/CacheMgr');
const stringUtils = require('dw/util/StringUtils');
const PromotionMgr = require('dw/campaign/PromotionMgr');

const Bopishelper = require('app_composable/cartridge/scripts/helpers/objects/BasketComponents/BopisHelper.js');
const BopisOrderLimits = require('app_composable/cartridge/scripts/helpers/global/BopisOrderLimits.js');
const productHelper = require('app_composable/cartridge/scripts/helpers/objects/product.js');
const basketResponseHelper = require('app_composable/cartridge/scripts/helpers/objects/basketResponse.js');
const basketHelper = require('app_composable/cartridge/scripts/helpers/objects/basket.js');
const Validation = require('app_composable/cartridge/scripts/helpers/util/validationsUtil.js');
const estimatedShipping = require('app_composable/cartridge/scripts/helpers/util/estimatedShipping.js');
const OGHelper = require("int_ordergroove/cartridge/scripts/composable/promotionHelper.js");
const { getBopisBanner, getApproachingShippingDiscountBanner } = require('app_composable/cartridge/scripts/helpers/objects/BasketComponents/cartMessaging.js');
const shopperContextHelper = require('app_composable/cartridge/scripts/helpers/adobe/shopperContextHelper.js');
/**
 * Handles what logic to run for the basket response
 * @function beforePOST
 * @memberof getBasketHelper
 * @param basket {dw.order.Basket} the current basket object
 * @param response {Basket}
 */
function handleModify(response, basket) {
    basketResponseHelper.addShippingSurchargeData(response, basket, basket.custom.preferredStore);
    basketResponseHelper.addCartLevelMessaging(response, basket);
    basketResponseHelper.reOrderCartResponse(response);
    basketResponseHelper.attachPromoInfoToCouponItems(response, basket);
    basketResponseHelper.getShippingRestrictedItems(response, basket);
    basketResponseHelper.handleCustomSubTotal(response, basket);
    basketResponseHelper.setBasketLimitResponseData(response);
    if (Site.getCustomPreferenceValue('isBOPISRadiusCartChecksEnabled')) {
        Bopishelper.checkBopisRadiusStores(basket, response);
    }
    basketResponseHelper.buildFakeProductLineItemsByDiscount(response, basket);
    modifyResponseNoContext(response, basket);
    if (shopperContextHelper.isFeatureEnabled('shopping-bag-redesign', 'enableShoppingBagRedesign')) {
        basketResponseHelper.addPLILevelMessaging(response, basket);
    }
    Validation.validateResponse(response, "Basket-Attributes")
    basketResponseHelper.addBasketResultMessage(response);
}

/**
 * Handles the logic to run on the response based on no page contect being passed.
 *
 * @function modifyResponseNoContext
 * @memberof getBasketHelper
 * @param {Object} response
 * @param {dw.order.Basket} basket  the current basket object
 */
function modifyResponseNoContext(response, basket) {
    if (!empty(basket)) {
        if (!empty(response.productItems)) {
            handleBagFeeProductItems(response);
            handleGiftBoxProductItems(response);
            handleProductLevelChanges(response, basket);
            handleAnyMissingPliRequiredElements(response, basket);
            handleFulfillmentCount(response, basket);
        }
        if (!empty(response.giftCertificateItems)) {
            handleGiftCertLevelChanges(response, basket);
        }
        handleOrderLevelChanges(response, basket);
        handleShipmentLevelChanges(response, basket);
        response.c_appPrefs = handleAppPreferences(response, basket)
        response.c_deletedProductId = request.custom.deletedItemId;
    }
}

/**
 *
 * @param {Object} response
 * @param {Basket} basket
 * @returns {Object} //container of preferences for app to utilize
 */
function handleAppPreferences(response, basket) {
    const prefOBJ = {}
    const appPrefs = Site.getCustomPreferenceValue("AppCustomPrefs")
    appPrefs.forEach(pref => {
        prefOBJ[pref] = Site.getCustomPreferenceValue(pref)
    })
    return prefOBJ
}

/**
 * Take items from the basket and count them in their
 * respective fulfillment
 * @function handleFulfillmentCount
 * @memberof getBasketHelper
 * then write them to the response object in each category
 */
function handleFulfillmentCount(response, basket) {
    const bagFeeNames = Site.getCustomPreferenceValue('BagFeeNames');
    response.shipments.toArray().forEach((shipment) => {
        shipment.c_itemCount = basket.productLineItems.toArray().filter(e => e.shipment.ID == shipment.shipmentId).reduce((a, b) => bagFeeNames.includes(b.productName) || (b.custom.isGiftCard && b.custom.isVirtual) ? a : a + b.quantityValue, 0);
    })
}


/**
 * function to handle the missing pli info
 * @function handleAnyMissingPliRequiredElements
 * @memberof getBasketHelper
 * @param {*} response
 * @param {*} basket
 */
function handleAnyMissingPliRequiredElements(response, basket) {
    response.productItems.toArray().forEach(productItem => {
        let pli = basketHelper.getExsistingLineItemInCart(productItem.productId, basket, productItem.c_fromStoreId);
        let product = pli.product;
        if (empty(productItem.c_imageURL)) {
            let image = product.getImage('crop', 0);
            if (empty(image)) {
                image = product.getImage('hires', 0)
            }
            productItem.c_imageURL = !empty(image) ? image.getAbsURL().toString() : ''
        }
        productItem.c_itemSize = empty(productItem.c_itemSize) ? stringUtils.decodeString(product.custom.size, 0) : productItem.c_itemSize;
        productItem.c_itemSubtitle = empty(productItem.c_itemSubtitle) ? stringUtils.decodeString(product.custom.form, 0) : productItem.c_itemSubtitle;
        productItem.c_itemName = empty(productItem.c_itemName) ? stringUtils.decodeString(productHelper.getProductName(product), 0) : productItem.c_itemName;
        productItem.c_pdpProductID = empty(productItem.c_pdpProductID) ? 'c_masterSku' in productItem && !empty(productItem.c_masterSku) ? productItem.c_masterSku : product.ID : productItem.c_pdpProductID;
    });
}
/**
 * Removes bag fees from the response object so they are not displayed on minibag as well as putting a flag on the basket if bag fees are present.
 * @function handleBagFeeProductItems
 * @memberof getBasketHelper
 * response {Basket}
 */
function handleBagFeeProductItems(response) {
    let bagFeeSKUs = Bopishelper.getBagFeeSKUs();
    let newList = response.productItems.toArray().filter(e => bagFeeSKUs.indexOf(e.product_id) == -1);
    if (newList.length != response.productItems.length) {
        response.c_hasBagFees = true;
    }
    else {
        response.c_hasBagFees = false;
    }
    response.productItems = new dw.util.ArrayList(newList)

}
/**
 * Removes giftBox items from the response object so they are not displayed on minibag as well as putting a flag on the basket if a gift box is present.
 * @function handleGiftBoxProductItems
 * @memberof getBasketHelper
 * response {Basket}
 */
function handleGiftBoxProductItems(response) {
    let giftBoxSku = Site.getCustomPreferenceValue('GiftBoxSKU');
    if (!empty(giftBoxSku)) {
        let giftBoxItems = response.productItems.toArray().filter(e => e.product_id === giftBoxSku);
        let nonGiftBoxItems = response.productItems.toArray().filter(e => e.product_id !== giftBoxSku);
        let giftBoxTotal = giftBoxItems.reduce((accumulator, current) => accumulator.price + current.price, 0);
        if (!empty(giftBoxItems)) {
            response.c_hasGiftBox = true;
            response.productItems = nonGiftBoxItems
            response.product_sub_total = response.product_sub_total - giftBoxTotal;
        }
    }
}

/**
 * function to store gift level details at gc line level
 * @function handleGiftCertLevelChanges
 * @memberof getBasketHelper
 * @param {*} response
 * @param {*} basket
 */
function handleGiftCertLevelChanges(response, basket) {
    response.giftCertificateItems.toArray().forEach(gc => {
        let gcli = basket.giftCertificateLineItems.toArray().find(e => e.UUID == gc.giftCertificateItemId);
        gc.c_lineItemText = gcli.lineItemText;
        let product = dw.catalog.ProductMgr.getProduct(gcli.giftCertificateID);
        gc.c_available = gc.c_isVirtual || empty(product) ? true : productHelper.hasSFCCInventory(product);
        gc.c_productId = gcli.giftCertificateID;
    })
}


/**
 * Handle product level attributes
 * @function handleProductLevelChanges
 * @memberof getBasketHelper
 * @param {*} response
 * @param {*} basket
 */
function handleProductLevelChanges(response, basket) {
    response.productItems.toArray().forEach(product => {
        let pli = basketHelper.getExsistingLineItemInCart(product.productId, basket, product.c_fromStoreId)
        handlePriceBook(product, pli);
        handleAvalabilityOfProduct(product, pli, "preferredStore" in basket.custom ? basket.custom.preferredStore: product.c_fromStoreId);
        handleApproachingDiscounts(product, pli);
        product.c_shippingMethod = pli.shipment ? pli.shipment.shippingMethodID : null;
        handlePromoCalloutDetailMessaging(product, pli);
        product.c_autoRefreshAvailable = !empty(pli.product.custom.autoRefresh) && pli.product.custom.autoRefresh;
    });
}

/**
 * Handles adding the standard price of the product to all items
 *
 * @param {responseProductLineItem} product - The product line item response object
 * @param {ProductLineItem} pli - The product line item
 */
function handlePriceBook(product, pli) {
    const standardPrice = productHelper.getProductStandardPrice(pli.product);
    if (!empty(standardPrice) && !pli.custom.isGiftCard) {
        product.price = new dw.value.Money(standardPrice, pli.adjustedPrice.currencyCode).multiply(product.quantity).getDecimalValue();
        product.basePrice = new dw.value.Money(standardPrice, pli.adjustedPrice.currencyCode).getDecimalValue();
    }
}

/**
 * Handles changes at the order level by analyzing active customer promotions and updating the response object with the relevant promotion details and messages.
 *
 * @param {Object} response - The response object to be updated with promotion details if applicable.
 * @return {void} This function does not return a value. It updates the `response` object directly if a promotion is applicable.
 */
function handleOrderLevelChanges(response) {

    if (!empty(response.orderPriceAdjustments)) {
        addPromoCalloutDetailMessagingToPriceAdjustments(response.orderPriceAdjustments, false);
    }
}

/**
 * Handles shipment level changes by mapping response data to the basket's shipment data
 * and applying corresponding shipping promotions if applicable.
 *
 * @param {Object} response - The API response containing updated shipment information.
 * @return {void} This function does not return a value; it modifies the shipment object in the basket.
 */
function handleShipmentLevelChanges(response, basket) {
    response.shippingItems.toArray().forEach(shippingItem => {
        addPromoCalloutDetailMessagingToPriceAdjustments(shippingItem.priceAdjustments, true);
    });
    response.shipments.toArray().forEach(shipment => {
        if (Site.getCustomPreferenceValue('isEstimatedShippingEnabled')) {
            if (!empty(shipment.shippingMethod) && !empty(shipment.shippingMethod.id)) {
                let data;
                if (Site.getCustomPreferenceValue('isEstimatedShippingCacheEnabled')) {
                    let cache = CacheMgr.getCache("estimatedDelivery");
                    if (cache.get(shipment.shippingMethod.id)) {
                        data = JSON.parse(cache.get(shipment.shippingMethod.id));
                    } else {
                        data = estimatedShipping.calculateDeliveryDates(null, shipment.shippingMethod.id);
                        if (data.success) {
                            cache.put(shipment.shippingMethod.id, JSON.stringify(data));
                        }
                    }
                }
                else {
                    data = estimatedShipping.calculateDeliveryDates(null, shipment.shippingMethod.id);
                }
                if (data.success) {
                    shipment.shippingMethod.c_displayEstimatedDelivery = !empty(data.calendarEndTimeBothDates) ? data.calendarEndTimeBothDates : data.calendarEndTimeFormated;
                }
            }
        }
        //Check if basket is type of dw.order.Basket
        if (basket instanceof dw.order.Basket) {
            shipment.c_messages = getShipmentMessages(shipment.shipmentId, basket, !empty(shipment.c_fromStoreId));
        }
    });
}

/**
 * Generates shipment-level messages for a given shipment in the basket, including BOPIS banners and shipping discount info.
 *
 * @function getShipmentMessages
 * @memberof getBasketHelper
 * @param {string} shipmentId - The ID of the shipment to retrieve messages for.
 * @param {dw.order.Basket} basket - The current basket object containing shipments.
 * @param {boolean} isBopis - Indicates if the shipment is a BOPIS (Buy Online Pickup In Store) shipment.
 * @returns {Array<Object>} An array of message objects relevant to the shipment, such as banners or shipping discount info.
 */
function getShipmentMessages(shipmentId, basket, isBopis) {
    let messages = [];
    if (!empty(basket.shipments)) {
        let shipment = basket.shipments.toArray().find(s => s.ID === shipmentId);
        if (isBopis) {
            messages.push(getBopisBanner(basket, shipment.custom.fromStoreId));
        }
        else {
            const DiscountPlan = dw.campaign.PromotionMgr.getDiscounts(basket);
            const approachingShippingDiscounts = getApproachingShippingDiscountBanner(shipment, DiscountPlan);
            if (!empty(approachingShippingDiscounts)) {
                messages = approachingShippingDiscounts;
            }
            else if (shipment.adjustedShippingTotalPrice && shipment.adjustedShippingTotalPrice.value === 0) {
                messages.push({ type: "info", message: "Your order shipping will be free.", "ID": "freeShipping" })
            }
        }
    }
    return messages;
}

/**
 * Adds promotional callout and detail messaging to the provided array of price adjustments.
 *
 * @param {dw.util.Collection} priceAdjustments - A collection or array of price adjustment objects to which the promotional messages will be added.
 * @param {boolean} isShippingPriceAdjustment - A flag indicating if the price adjustments pertain to shipping or not.
 * @return {void}
 */
function addPromoCalloutDetailMessagingToPriceAdjustments(priceAdjustments, isShippingPriceAdjustment) {
    if (!empty(priceAdjustments)) {
        let priceAdjustmentsArray = priceAdjustments.toArray();
        priceAdjustmentsArray.forEach((priceAdjustment, i) => {
            let promotionId = priceAdjustment.promotionId;
            if (isShippingPriceAdjustment && priceAdjustment.promotionId.indexOf('OG-Promo') > -1 && Site.getCustomPreferenceValue("OrderGrooveShippingPromoID")) {
                promotionId = Site.getCustomPreferenceValue("OrderGrooveShippingPromoID");
            }
            let promotion = PromotionMgr.getPromotion(promotionId);
            if (!empty(promotion)) {
                priceAdjustments[i].c_calloutMessage = !empty(promotion.calloutMsg) ? promotion.calloutMsg.markup : '';
                priceAdjustments[i].c_promotionDetails = !empty(promotion.details) ? promotion.details.markup : '';
            }
        });
    }
}

/**
 * Appends to each product line item the flag if its available based on sfcc and the max purchase limit amount .
 * product {response product line object} the product in the response.
 * @function handleAvalabilityOfProduct
 * @memberof getBasketHelper
 * pli {ProductLineItem} the product line item associated with the response product.
 */
function handleAvalabilityOfProduct(product, pli, storeID) {
    let productAvailabilityObj = productHelper.getSFCCAvailability(pli.product, storeID);
    product.c_available = productHelper.hasSFCCInventory(pli.product, product.c_fromStoreId);
    product.c_purchaseLimit = BopisOrderLimits.getPurchaseLimit(pli.product, product.c_fromStoreId)
    product.c_maxAvailableToAdd = product.c_purchaseLimit - pli.quantity
    product.c_webInventory =  !empty(pli.custom.webInventory) && productAvailabilityObj.webInv !=0 ? pli.custom.webInventory : productAvailabilityObj.webInv;
    product.c_storeInventory = !empty(pli.custom.storeInventory) && productAvailabilityObj.storeInv !=0 ? pli.custom.storeInventory : productAvailabilityObj.storeInv;
}

/**
 * Handles approaching discounts for a given product by analyzing active customer promotions
 * and updating the product with promotional details if applicable.
 * @function handleApproachingDiscounts
 * @memberof getBasketHelper
 * @param {Object} product - The product object to which approaching discount callout might be added.
 * @param {dw.order.ProductLineItem} pli - The product line item object which is used to fetch relevant product promotions.
 * @return {void} Returns nothing. The function modifies the product object directly if conditions are met.
 */
function handleApproachingDiscounts(product, pli, PLIQualifiedAndAppliedPromotions) {
    //is item approaching or qualifying
    if (empty(product.priceAdjustments)) {
        let promotions = dw.campaign.PromotionMgr.activeCustomerPromotions.getProductPromotions(pli.product);
        if (!empty(promotions)) {
            let lowestRankPromo = promotions.toArray().filter(e => !e.basedOnCoupons && showPromoDetailsAndCalloutMessage(e, promotions, pli.product, !empty(pli.getPriceAdjustments()))).reduce((a, b) => empty(a.rank) || (!empty(b.rank) && b.rank < a.rank) ? b : a, { rank: null });
            product.c_approachingDiscountCallout = {
                details: !empty(lowestRankPromo.details) ? lowestRankPromo.details.markup : '',
                calloutMsg: !empty(lowestRankPromo.calloutMsg) ? lowestRankPromo.calloutMsg.markup : ''
            };
        }
    }
}
/**
 *
 * @param {Promotion} promo
 * @param {Object} PLIQualifiedAndAppliedPromotions
 * @param {String} productID
 * @returns {Boolean}
 */
function showPromoDetailsAndCalloutMessage(promo, promotions, product, haspriceAdjustments) {
    if (Site.getCustomPreferenceValue("enableSupportForhidePromoCalloutAndDetailsOnQualifyingItems") && "hidePromoCalloutAndDetailsOnQualifyingItems" in promo.custom && promo.custom.hidePromoCalloutAndDetailsOnQualifyingItems) {
        let returnValue = productHelper.getProductQualifyingButNotDiscountedCache(product, promo.ID, promotions.toArray().map(promo => promo.ID));
        return returnValue && !haspriceAdjustments;
    }
    return true;
}
/**
 * Add Promo callout message info to
 * @function handlePromoCalloutDetailMessaging
 * @memberof getBasketHelper
 * @param {*} product
 * @param {*} pli
 */
function handlePromoCalloutDetailMessaging(product, pli) {
    if (!empty(product.priceAdjustments)) {
        let priceAdjustments = product.priceAdjustments;
        if (!empty(priceAdjustments)) {
            let priceAdjustmentsArray = priceAdjustments;
            if (priceAdjustments instanceof dw.util.Collection) {
                priceAdjustmentsArray = priceAdjustments.toArray();
            }
            priceAdjustmentsArray.forEach((priceAdjustment, i) => {
                let promotion = priceAdjustment.promotionId.indexOf('OG-Promo') > -1 ? OGHelper.getOGProductPromo() : PromotionMgr.getPromotion(priceAdjustment.promotionId);
                if (!empty(promotion)) {
                    priceAdjustments.get(i).c_calloutMessage = !empty(promotion.calloutMsg) ? promotion.calloutMsg.markup : "";
                    priceAdjustments.get(i).c_promotionDetails = !empty(promotion.details) ? promotion.details.markup : "";
                    priceAdjustments.get(i).c_showItemName = !empty(promotion.name);
                }
            })
        }
    }
}

module.exports = {
    handleModify,
    modifyResponseNoContext,
    showPromoDetailsAndCalloutMessage,
}
