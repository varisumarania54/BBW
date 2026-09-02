/**
 * @namespace couponHelper.js
 */
'use strict';
const Site = require('dw/system/Site').getCurrent();
const Status = require("dw/system/Status");
const CouponMgr = require("dw/campaign/CouponMgr");
const CouponObjHelper = require('app_composable/cartridge/scripts/helpers/objects/coupon.js');
const errorHandler = require('app_composable/cartridge/scripts/helpers/util/errorHandler.js').errorHandler;
const loyaltyHelper = require('app_composable/cartridge/scripts/helpers/loyalty/loyaltyHelper.js').loyaltyHelper;
const shopperContextHelper = require('app_composable/cartridge/scripts/helpers/adobe/shopperContextHelper.js');
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;

/**
 * Checks basket exceeds the coupon limit
 * param {dw.order.Basket} The sfcc basket object
 * return true(basket is over the coupon limit ) otherwise false
 */
function overCouponLimit(basket, couponItem) {
    let coupon;
    let couponType;
    if (couponItem) {
        coupon = CouponMgr.getCouponByCode(couponItem.code);
        couponType = coupon ? CouponObjHelper.getCouponType(coupon.ID) : null;
    }
    if (couponType && (couponType === 'reward')) {
        // check if loyalty Coupon limit exceeded
        let loyaltyCouponCount = getLoyaltyCouponCountInCart(basket);
        if (loyaltyCouponCount > 8) {
            return true;
        }
    } else {
        let couponLimit = CouponObjHelper.getCurrentCouponLimit();
        let currentCouponCount = CouponObjHelper.getNumberOfNonLoyaltyCouponsInBag(basket.couponLineItems);
        if (currentCouponCount > couponLimit) {
            return true;
        }
    }

    return false;
}
/**
 * Checks the amount of coupons on the basket exceeds the limit, if so, removes them all fromm the basket
 * @param {*} basket - The user's basket
 */

function removeBasketCouponsIfOverLimit(basket) {
    if (overCouponLimit(basket)) {
        let couponLineItems = basket.getCouponLineItems();
        for (let i = couponLineItems.length - 1; i >= 0; i--) {
            basket.removeCouponLineItem(couponLineItems[i]);
        }
    }
}

/**
 * Checks if a coupon is valid based on the pre checks
 * param {dw.order.Basket} The sfcc basket object
 * param {couponInput} the sfcc request coupon object
 * return status error when in violation
 */
function validateCouponCode(basket, couponInput) {
    const coupon = CouponMgr.getCouponByCode(couponInput.code);
    const couponType = !empty(coupon) ? CouponObjHelper.getCouponType(coupon.ID) : null;
    if ((couponType == 'default' || couponType == 'offer') &&
        !empty(Site.getCustomPreferenceValue('hideCouponField')) && Site.getCustomPreferenceValue('hideCouponField') &&
        !session.userAuthenticated
    ) {
        const error = new Status(Status.ERROR, '400', errorHandler.getErrorMessage('COUPON-04-012'))
        error.addDetail('ID', 'couponFieldHidden')
        return error;
    }
    const redesign = shopperContextHelper.isFeatureEnabled('shopping-bag-redesign', 'enableShoppingBagRedesign');
    if (empty(couponInput.code)) {
        return new Status(Status.ERROR, '400', redesign ? errorHandler.getErrorMessage('COUPON-04-015') : errorHandler.getErrorMessage('COUPON-04-001'));
    }

    if (empty(coupon) || !coupon.enabled || !CouponObjHelper.hasActivePromo(coupon)) {
        return new Status(Status.ERROR, '400', errorHandler.getErrorMessage('COUPON-04-002'));
    }
    if (!empty(coupon.redemptionLimitPerCode) && coupon.redemptionLimitPerCode <= CouponMgr.getRedemptions(coupon.ID, couponInput.code).length) {
        return new Status(Status.ERROR, '400', errorHandler.getErrorMessage('COUPON-04-003'));
    }
    let conflictingCoupon = checkCouponConflict(basket, coupon);
    if (conflictingCoupon) {
        return new Status(Status.ERROR, '400', errorHandler.getErrorMessage('COUPON-04-011', conflictingCoupon));
    }
}

/**
 * Determines if the provided coupon is a loyalty coupon.
 *
 * @param {dw.campaign.Coupon} coupon - The coupon object to check.
 * @return {boolean} Returns true if the coupon is identified as a loyalty coupon, otherwise returns false.
 */
function isLoyaltyCoupon(coupon) {
    return coupon ? coupon.ID.toLowerCase().indexOf('loyalty') !== -1 : false;
}

/**
 * Checks for conflicts between a given coupon and the coupons already present in the basket.
 *
 * @param {dw.order.Basket} basket - The current shopping basket containing coupon line items.
 * @param {dw.campaign.Coupon} coupon - The coupon to be checked for conflicts.
 * @return {Object} An object containing conflict details:
 *                  - `foundConflict` (boolean): Indicates whether a conflict was found.
 *                  - `conflictedCoupon` (string): The conflicting coupon code, if a conflict exists.
 */
function checkCouponConflict(basket, coupon) {
    let conflictedCoupon = '';

    if (empty(basket) || empty(coupon) || isLoyaltyCoupon(coupon)) {
        return conflictedCoupon;
    }

    let couponExclusivity = coupon.promotions.length > 0 ? coupon.promotions[0].exclusivity : '';

    // Return if no existing coupons or if coupon allows multiple applications
    if (basket.couponLineItems.length === 0 ||
        (!empty(couponExclusivity) && couponExclusivity.toLowerCase() === 'no')) {
        return conflictedCoupon;
    }

    // Check for conflicts with existing coupons
    const currentCouponLineItems = basket.couponLineItems.toArray();
    const nonLoyaltyCoupons = currentCouponLineItems.filter(item =>
        !isLoyaltyCoupon(CouponMgr.getCouponByCode(item.couponCode))
    );

    // Find first conflicting coupon
    const conflictingCoupon = nonLoyaltyCoupons.find(existingCoupon => {
        let couponObj = CouponMgr.getCouponByCode(existingCoupon.couponCode);
        let activePromos = couponObj.promotions.toArray().filter(e => e.isEnabled());
        if (!empty(activePromos)) {
            return activePromos[0].exclusivity.toLowerCase() === couponExclusivity.toLowerCase()
        }
        return false;
    }
    );

    if (conflictingCoupon) {
        conflictedCoupon = conflictingCoupon.couponCode;
    }

    return conflictedCoupon;
}

/**
 * function to validate loyalty coupon rules when being added to cart
 * @function validateLoyaltyCouponCode
 * @memberof couponHelper
 * @param {*} basket
 * @param {*} couponInput
 * @return {Object} return - the status if any error
 */
function validateLoyaltyCouponCode(basket, couponInput) {
    const coupon = CouponMgr.getCouponByCode(couponInput.code);
    const couponType = coupon ? CouponObjHelper.getCouponType(coupon.ID) : null;
    const redesign = shopperContextHelper.isFeatureEnabled('shopping-bag-redesign', 'enableShoppingBagRedesign');
    if (couponType && couponType === 'reward') {
        // check if added from regular coupon section
        if ('c_fromPromoBox' in couponInput && couponInput.c_fromPromoBox) {
            if (!basket.customer.authenticated) {
                return new Status(Status.ERROR, '400', redesign ? errorHandler.getErrorMessage('COUPON-04-016') : errorHandler.getErrorMessage('COUPON-04-005'));
            } else {
                let isLoyaltyCustomer = CouponObjHelper.isLoyaltyCustomer(basket.customer);
                if (isLoyaltyCustomer) {
                    return new Status(Status.ERROR, '400', redesign ? errorHandler.getErrorMessage('COUPON-04-017') :errorHandler.getErrorMessage('COUPON-04-004'));
                } else {
                    return new Status(Status.ERROR, '400', redesign ? errorHandler.getErrorMessage('COUPON-04-016') : errorHandler.getErrorMessage('COUPON-04-006'));
                }
            }

        }
        // loyalty coupon cannot be applied by guest customers
        if (!basket.customer.authenticated) {
            return new Status(Status.ERROR, '400', redesign ? errorHandler.getErrorMessage('COUPON-04-016') : errorHandler.getErrorMessage('COUPON-04-007'));
        }
        // check if coupon already exists in bag
        let isCouponAlreadyApplied = !empty(basket.getCouponLineItem(couponInput.code));
        if (isCouponAlreadyApplied) {
            return new Status(Status.ERROR, '400', errorHandler.getErrorMessage('COUPON-04-008'));
        }
        // check if loyalty coupon belongs to customer
        if (Site.getCustomPreferenceValue('LoyaltyCouponCheck') && (empty(session.userAuthenticated) || !session.userAuthenticated)) {
            appLoyaltyProfileUpdate(basket.customer.profile);
            if (empty(basket.customer.profile.custom.filteredOffers)) {
                return new Status(Status.ERROR, '400', errorHandler.getErrorMessage('COUPON-04-013'));
            }
            let filteredOffers = JSON.parse(basket.customer.profile.custom.filteredOffers);
            if (filteredOffers) {
                let rewards = filteredOffers.LoyaltyDataSet.Rewards.Entries;
                let promotionNames = Object.getOwnPropertyNames(rewards);
                let match = false;
                for (let i = 0; i < promotionNames.length; i++) {
                    for (let j = 0; j < rewards[promotionNames[i]].length; j++) {
                        if (couponInput.code == rewards[promotionNames[i]][j].OnlineCode) {
                            match = true;
                            break;
                        }
                    }
                }
                if (!match) {
                    return new Status(Status.ERROR, '400', redesign ? errorHandler.getErrorMessage('COUPON-04-013') : errorHandler.getErrorMessage('COUPON-04-009'));
                }
            }
        }
    }
}

/**
 * Updates the loyalty profile with offers if the request is from a mobile app and the token is provided.
 * This function checks if the loyalty offers need to be updated based on the last update time and a configured threshold.
 * If the token starts with "Bearer ", it removes the prefix before passing it to the loyalty helper.
 *
 * @function appLoyaltyProfileUpdate
 * @memberof couponHelper
 * @param {dw.customer.Profile} profile - The customer profile object to update with loyalty offers.
 * @throws {Error} Logs an error if an exception occurs during the loyalty profile update process.
 */
function appLoyaltyProfileUpdate(profile) {
    try {
        if (request.httpHeaders.get('c_mobile_app') == 'true' && !empty(request.httpHeaders.get('c_token'))) {
            let lastUpdated = empty(profile.custom.loyaltyOffersLastUpdated) ? 0 : Number(profile.custom.loyaltyOffersLastUpdated);
            let threshold = Site.getCustomPreferenceValue('thresholdBetweenLoyaltyUpdates');
            let updateTime = !empty(threshold) ? threshold * 1000 : 0;
            let fetchData = Date.now() >= (lastUpdated + updateTime);
            if (fetchData) {
                //If token starts with Bearer remove it
                let token = request.httpHeaders.get('c_token');
                if (token.startsWith('Bearer ')) {
                    token = token.substring(7);
                }
                loyaltyHelper.getOffers(profile, profile.custom.bondLoyaltyId, token, { loyaltyId: profile.custom.bondLoyaltyId, programPointsInfo: {} })
            }
            return;
        }
    } catch (e) {
        logHandler.logger.error(e, 'Hooks', 'addCoupon');
    }
}

/**
 * function to get  Loyalty Coupon Count In Cart
 * @function getLoyaltyCouponCountInCart
 * @memberof couponHelper
 * @param {*} basket
 * @return {Number} return -loyaltycoupon count in basket
 */
function getLoyaltyCouponCountInCart(basket) {
    let loyaltyCouponCount = 0;
    let couponObj;
    basket.couponLineItems.toArray().forEach((coupon) => {
        couponObj = CouponMgr.getCouponByCode(coupon.couponCode);
        if (couponObj.ID.toLowerCase().indexOf("loyalty") !== -1) {
            loyaltyCouponCount = loyaltyCouponCount + 1;
        }
    })
    return loyaltyCouponCount;
}

module.exports = {
    overCouponLimit,
    validateCouponCode,
    validateLoyaltyCouponCode,
    removeBasketCouponsIfOverLimit
}
