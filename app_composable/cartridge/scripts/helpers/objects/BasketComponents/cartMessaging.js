'use strict';
/**
 * @namespace CartBanners
 */

const Resource = require("dw/web/Resource");
const Site = require('dw/system/Site').getCurrent();
const composableBopisHelper = require('app_composable/cartridge/scripts/helpers/objects/BasketComponents/BopisHelper.js')
const basketHelper = require('app_composable/cartridge/scripts/helpers/objects/basket.js')
const BopisOrderLimits = require('app_composable/cartridge/scripts/helpers/global/BopisOrderLimits.js');
const sitePrefHelper = require('app_composable/cartridge/scripts/helpers/util/sitePrefHelper');
const shopperContextHelper = require('app_composable/cartridge/scripts/helpers/adobe/shopperContextHelper.js');
const bagRedesignEnabled = shopperContextHelper.isFeatureEnabled('shopping-bag-redesign', 'enableShoppingBagRedesign');

/**
 * Returns the error message object to be displayed at the top of the cart
 * @function getBasketErrorBanner
 * @memberof CartBanners
 * @param {Basket} basket - current user's basket
 * @param {Object} basketResponse - Response payload from basket service containing PLIs
 * @returns {Object|null} Object describing the banner payload or null when no banner is needed
 */
function getBasketErrorBanner(basket, basketResponse) {
    let errorObject = { type: "error" };
    const code = 'basketStatusCode' in basket.custom ? basket.custom.basketStatusCode : null;
    if ((!empty(code) && code !== "OK") ||
        !empty(request.custom.productMergedQtyChanged) ||
        !empty(request.custom.productMerged) ||
        (!empty(session.custom.bopisStoreUnavailable) && session.custom.bopisStoreUnavailable)) {
        switch (code) {
            case "paypal":
                //TODO: during paypal integration add erroring
                break;
            case "CouponError":
                if(!Site.getCustomPreferenceValue('EnableRemoveExpiredCouponCodes')){
                    errorObject.text = Resource.msg('cartcouponinvalid', 'cart', null);
                    errorObject.ID = "InvalidCoupon";
                }
                break;
            case "TaxError":
                errorObject.text = Resource.msg('taxinvalid', 'cart', null);
                errorObject.ID = "TaxCalc";
                break;
            case "TotalGrossError":
                errorObject.text = Resource.msg('zeroordererror', 'cart', null);
                errorObject.ID = "GrossError";
                break;
            case "ZeroDollarOrder":
                errorObject.text = Resource.msg('items.zerototal', 'cart', null);
                errorObject.ID = "ZeroBakset";
                break;
            case "AllBopisOffline":
                if(!bagRedesignEnabled){
                    errorObject.text = Site.getCustomPreferenceValue("BopisDisabledCartErrorMessage");
                    errorObject.ID = "BOPISoff";
                }
                break;
            case "SelectBopisOffline":
                // URL?Stores-BopisStoreFinder
                if(!bagRedesignEnabled){
                    errorObject.text = Resource.msg('items.selectBopisOffline', 'cart', null);
                    errorObject.ID = "BOPISStoreoff";
                }
                break;
            case "BASKETLIMIT":
                const data = JSON.parse(basket.custom.basketStatusMessage);
                basketResponse.productItems.toArray().forEach(item => {
                    if (data.limitData.items.indexOf(item.itemId) != -1) {
                        item.c_contributingProductMessage = Site.getCustomPreferenceValue('basketLimitQualifyingMessage');
                        item.c_lineLevelError = dw.util.StringUtils.format(Site.getCustomPreferenceValue('basketLimitInlineCartError'), "'", data.limitData.limit, data.limitData.category)
                        item.c_pliMessage = dw.util.StringUtils.format(Site.getCustomPreferenceValue('basketLimitInlineCartError'), "'", data.limitData.limit, data.limitData.category)
                        item.c_contributingProduct = true;
                    }
                });
                errorObject.text = data.message;
                errorObject.ID = "BasketLimit";
                break;
            case "LOWINVENTORY":
                if(!bagRedesignEnabled){
                    errorObject.text = Resource.msg('items.unavailable', 'cart', null);
                    errorObject.ID = "OutOfStock";
                }
                break;
            default:
                if (!bagRedesignEnabled && composableBopisHelper.validateBopisAvailability(basket)) {
                    errorObject.text = Resource.msg('items.selectBopisOffline', 'cart', null);
                    errorObject.ID = "BOPISStoreoff";
                }
        }
        if (empty(errorObject.text)) {
            if (basket.custom.basketStatusMessage.indexOf(Resource.msg('paypal.zeroordermsg', 'cart', null)) != -1) {
                errorObject.text = Resource.msg('zeroordererror', 'cart', null);
                errorObject.ID = "ZeroTotal";
            }
            else if (!sitePrefHelper.getSitePrefValue('enableStorePickUp')) {
                errorObject.text = Resource.msg('limitedQuantity', 'cart', null);//bopis specifc message missing
                errorObject.ID = "BopisOff";
            }
            else if (code == "LowRadialInventory" && !sitePrefHelper.getSitePrefValue('enableStorePickUp')) {
                errorObject.text = Resource.msg('limitedQuantity', 'cart', null);
                errorObject.ID = "LowInv";
            }
            else if (request.custom.productMerged) { //reinvision
                errorObject.text = Resource.msg('itemsmerged', 'cart', null)
                errorObject.ID = "Merged";
            }
            else if (request.custom.productMergedQtyChanged) { //reinvision
                errorObject.text = Resource.msg('itemsmergedqty', 'cart', null)
                errorObject.ID = "MergedAndAdjusted";
            }
            else if (code == "ReserveInventoryError") {// need to look at ReserveInventoryError
                errorObject.text = Resource.msg('items.unavailable', 'cart', null)
                errorObject.ID = "ReserverError";
            }
            else if(bagRedesignEnabled){
                const numberOfUnavailableItems = basketHelper.countUnavailableProducts(basket, basket.custom.preferredStore);
                if(numberOfUnavailableItems){
                    errorObject.text = Resource.msgf('items.unavailableCount', 'cart', null, numberOfUnavailableItems, numberOfUnavailableItems > 1 ? 'are' : 'is');
                    errorObject.ID = "OutOfStock";
                }
            }
        }
    }
    return !empty(errorObject.text) ? errorObject : null;
}

/**
* Returns the approuching discount messaging objects to be displayed at the top of the cart
* @function getApproachingOrderAndShippingDiscountBanner
* @memberof CartBanners
* @param {dw.order.Basket} basket - current user's basket
* @returns {Array[Object]} Array that contains objects that contains a type error and text holding the reson message
*/
function getApproachingOrderAndShippingDiscountBanner(basket) {
    const DiscountPlan = dw.campaign.PromotionMgr.getDiscounts(basket);
    let messaging = [];
    if (!empty(DiscountPlan)) {
        const approachingOrderDiscount = DiscountPlan.getApproachingOrderDiscounts();
        if (!empty(approachingOrderDiscount)) {
            messaging = messaging.concat(formatApproachingDiscountMessage(approachingOrderDiscount));
        }
        let shippingShipment = basketHelper.getShipment(basket);
        if (!empty(shippingShipment)) {
            messaging = messaging.concat(getApproachingShippingDiscountBanner(shippingShipment, DiscountPlan));
        }

        return messaging;
    }
}

/**
 * Returns approaching shipping discount messages for a given shipment using the provided discount plan.
 *
 * @function getApproachingShippingDiscountBanner
 * @memberof CartBanners
 * @param {dw.order.Shipment} shipment - The shipment object to check for approaching shipping discounts.
 * @param {Object} discountPlan - The discount plan object containing available discounts for the basket.
 * @returns {Array<Object>|undefined} An array of message objects if approaching shipping discounts exist, otherwise undefined.
 */
function getApproachingShippingDiscountBanner(shipment, discountPlan) {
    let approachingShippingDiscounts = discountPlan.getApproachingShippingDiscounts(shipment);
    if (!empty(approachingShippingDiscounts)) {
        return formatApproachingDiscountMessage(approachingShippingDiscounts);
    }
}

/**
 * Formats approaching discount objects into standardized message objects for display in the cart.
 *
 * @function formatApproachingDiscountMessage
 * @memberof CartBanners
 * @param {dw.campaign.ApproachingDiscounts} approachingDiscounts - A collection of approaching discount objects to format.
 * @returns {Array<Object>} An array of formatted message objects for each approaching discount.
 */
function formatApproachingDiscountMessage(approachingDiscounts) {
    return approachingDiscounts.toArray().map(e => (
        {
            type: 'info',
            text: bagRedesignEnabled? Resource.msgf('approachingpromo.purchase.shipping.message', 'cart', null, e.getDistanceFromConditionThreshold().toFormattedString(), e.getDiscount().getPromotion().getCalloutMsg())
             :Resource.msgf('approachingpromo.purchase.message', 'cart', null, e.getDistanceFromConditionThreshold().toFormattedString(), e.getDiscount().getPromotion().getCalloutMsg()),
            ID: "ApprouchingDisount"
        }
    ));
}

/**
 * TODO placeholder for CBD-specific cart messaging
 * @function getCBDMessaging
 * @memberof CartBanners
 * @returns {void}
 */
function getCBDMessaging() {
    //Need to rethink the approach on this
    // <isif condition="${(!empty(pdict.CurrentSession.custom) && pdict.CurrentSession.custom.CBDRedirect) || request.custom.productRemoved}">
    //     <div class="item-removed-message">
    //     <isprint value="${Resource.msg('cart.itemremoved','checkout',null)}" encoding="off"/>
    //     </div>
    // </isif>
}

/**
* Returns messaging for applying a promotion that is not qualified
* @function getCouponNotQualifiedBanner
* @memberof CartBanners
* @param {Basket} basket - current user's basket
* @returns {Object} objects that contains a type info and text holding the reson message
*/
function getCouponNotQualifiedBanner(basket) {
    if ('couponBannerMsg' in basket.custom && !empty(basket.custom.couponBannerMsg)) {
        return {
            type: "info",
            text: Resource.msg(basket.custom.couponBannerMsg, 'cart', null),
            ID: "FullSpecific"
        };
    }
}

/**
 * Returns messaging informing the customer they are getting x items free
 * @function getFreeItemBanner
 * @memberof CartBanners
 * @param {Basket} basket -current user's basket
 * @returns {Object} objects that contains a type success and text holding the reson message
 */
function getFreeItemBanner(basket) {
    const freeItemCount = basketHelper.getFreeItemCount(basket);
    if (freeItemCount > 0) {
        return { type: "success", text: Resource.msgf('bogopromo', 'cart', null, freeItemCount), ID: "FreeItem"}
    }
}

/**
 * Returns messaging around bopis based on the user's basket
 *
 * @function getBopisBanner
 * @memberof CartBanners
 * @param {dw.order.Basket} basket - current user's basket
 * @param {String} storeid - bopis store id
 * @returns {Object} objects that contains a type info and text holding the reson message
 */
function getBopisBanner(basket, storeid) {
    if (!sitePrefHelper.getSitePrefValue('enableStorePickUp')) {
        return null;
    }
    //OOBO Logic will need added  pdict.CurrentUserName != 'storefront' && pdict.CurrentSession.custom.csrBopisExperienceAllowed === 'true')?
    let bopisBannerText = bagRedesignEnabled ? null : Site.getCustomPreferenceValue('bopisSelectStoreMessage');
    if (!empty(storeid)) {
        const isCartBopisEligible = basket.getAllProductLineItems().toArray().some(e => e.product.custom.availableForInStorePickup);
        if(bagRedesignEnabled && isCartBopisEligible){
            if (Site.getCustomPreferenceValue('AllBopisStoresUnavailable') || !sitePrefHelper.getSitePrefValue('enableStorePickUp')){
                return { type: "info", text: Resource.msg('banner.cart.allstoresoffline','cart',null), ID: "BOPISAllStoresOff" }
            } else if (!BopisOrderLimits.isBopisStoreAvailable(storeid)){
                return { type: "info", text: Resource.msg('banner.cart.bopisstore.unavailable','cart',null), ID: "BOPISSelectedStoreOff" } ;
            }
        }

        if (isCartBopisEligible && ("basketStatusCode" in basket.custom && basket.custom.basketStatusCode == null || basket.custom.basketStatusCode == "OK") &&
            empty(request.custom.productMergedQtyChanged) &&
            empty(request.custom.productMerged) &&
            !composableBopisHelper.validateBopisAvailability(basket)) {
            let basketType = basketHelper.getCategorizationString(basket);
            if (!empty(Site.getCustomPreferenceValue('isHighVolumeDay')) && Site.getCustomPreferenceValue('isHighVolumeDay')) {
                bopisBannerText = Site.getCustomPreferenceValue('bopisHighVolumeMessage');
            } else if (basketType.includes('BOPIS')) {
                bopisBannerText = Site.getCustomPreferenceValue('bopisHoldOrderMessage');
            } else {
                bopisBannerText = Site.getCustomPreferenceValue('bopisOrderMessage');
            }
        }
        // Set store unavailability messaging if store is not available for pickup or All bopis stores off message
    }
    return empty(bopisBannerText) ? null : { type: "info", text: bopisBannerText, ID: "BOPISInfo" };
}

/**
 * Returns messaging informing that the item as removed successfully
 * @function getItemRemovedMessage
 * @memberof CartBanners
 * @return {Object} objects that contains a type error and text holding the reason message
 */
function getItemRemovedMessage() {
    return { type: "success", text: "Got it! We’ve removed the item(s) from your cart.", ID: "ItemRemoved" }
}

/**
 * Returns error message if someone is not logged in and trying to checkout with an auto refresh item
 * @function getOGLoginRequiredBanner
 * @memberof CartBanners
 * @param {Basket} basket -current user's basket
 * @return {Object} objects that contains a type error and text holding the reason message
 */
function getOGLoginRequiredBanner(basket) {
    if ((empty(customer) || !customer.registered) && basket.productLineItems.toArray().some(e => e.custom.isAutoRefreshSubscribedItem)) {
        return { type: "error", text: Resource.msg('ordergrooverestriction', 'cart', null), ID: "LoginNeeded"};
    }
}

/**
 * Returns banner if basket was merged
 * @function getCartMergeBanner
 * @memberof CartBanners
 * @param {Basket} basket -current user's basket
 * @return {Object} objects that contains a type success and text holding thecart merge message
 */
function getCartMergeBanner(basket) {
    if ('merged' in basket.custom && basket.custom.merged) {
        const bannerMessage = Site.getCustomPreferenceValue('mergedCartBannerMessage');
        if(bagRedesignEnabled) {
             return !empty(bannerMessage) ? { type: "info", text: bannerMessage, displayInHeader: true, ID: "Merge" } : null;
        }
        return !empty(bannerMessage) ? { type: "success", text: bannerMessage, displayInHeader: true, ID: "Merge" } : null;
    }
}


/**
 * Returns messaging when the coupon input has been intentionally hidden
 * @function getHiddenCouponInputMessage
 * @memberof CartBanners
 * @returns {Object} Message descriptor for rendering in the cart header
 */
function getHiddenCouponInputMessage() {
    return { type: "error", text: Resource.msg('coupons.couponFieldHidden', 'cart', null), displayInHeader: true, ID: 'couponFieldHidden'};
}


/**
 * Returns messaging when an expired coupon was removed server-side
 * @function getExpiredCouponRemovedMessage
 * @memberof CartBanners
 * @returns {Object|null} Expired coupon banner descriptor or null when preference is unset
 */
function getExpiredCouponRemovedMessage(){
    if(Site.getCustomPreferenceValue('ExpiredCouponDeletedMessage')){
        return { type: "info", text: Resource.msg(Site.getCustomPreferenceValue('ExpiredCouponDeletedMessage'), 'cart', null), displayInHeader: true, ID: 'expiredCouponRemoved'}
    }
}
module.exports = {
    getBasketErrorBanner,
    getApproachingOrderAndShippingDiscountBanner,
    getCouponNotQualifiedBanner,
    getFreeItemBanner,
    getBopisBanner,
    getItemRemovedMessage,
    getOGLoginRequiredBanner,
    getCartMergeBanner,
    getHiddenCouponInputMessage,
    getExpiredCouponRemovedMessage,
    getApproachingShippingDiscountBanner
}
