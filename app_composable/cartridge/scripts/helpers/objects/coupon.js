'use strict';
/**
 * @namespace Coupon
 */
const Site = require('dw/system/Site').getCurrent();
const CouponMgr = require('dw/campaign/CouponMgr');
const couponRegexs = [
    {regex : /^loyalty/i, couponType : 'reward'},
    {regex : /^mybbw/i, couponType : 'offer'}
];

/**
 * Checks if a coupon has at least 1 active promotion
 * @function hasActivePromo
 * @memberof Coupon
 * @param {*} coupon
 * @returns {boolean} true(if any promotion tied to the coupon is enabled and active) otherwise false
 */
function hasActivePromo(coupon) {
    if (!empty(coupon.promotions)) {
        const activePromotions = coupon.promotions.toArray().filter(e=>e.enabled && e.active);
        return !empty(activePromotions);
    }
    return false;
}

/**
 * Returns the type of coupon based on ID of coupon
 * @function getCouponType
 * @memberof Coupon
 * @param {*} couponID ID of the coupon
 * @returns {String}
 */
function getCouponType(couponID) {
    const offerCouponIDs = !empty(Site.getCustomPreferenceValue('OfferCouponIDs'))? Site.getCustomPreferenceValue('OfferCouponIDs') : [];
    const rewardCouponIDs = !empty(Site.getCustomPreferenceValue('LoyaltyCouponIDs'))? Site.getCustomPreferenceValue('LoyaltyCouponIDs') : [];
    let type = 'default';
    const couponObj = couponRegexs.find((e)=> e.regex.test(couponID));
    type = offerCouponIDs.includes(couponID) ? 'offer' : type;
    type = rewardCouponIDs.includes(couponID) ? 'reward' : type;
    type = !empty(couponObj) && type === 'default' ? couponObj.couponType : type;
    return type;
}

/**
 * Returns the current cupon limits for storefront
 * @function getCurrentCouponLimit
 * @memberof Coupon
 * @returns {Number}
 */
function getCurrentCouponLimit() {
    if (Site.getCustomPreferenceValue('EnableMultipleCoupons')) {
        if (session.userAuthenticated) {
            return Site.getCustomPreferenceValue('couponNumberLimitOOBO');
        }
        if (!empty(getFeatureToggleState('couponNumberLimit'))) {
            let couponNumberLimit =  getFeatureToggleState('couponNumberLimit');
            if (couponNumberLimit) {
                return couponNumberLimit;
            }
        }
        let pref = Site.getCustomPreferenceValue('couponNumberLimit');
        return !empty(pref) ? pref : 1
    }
    return 1;
}

/**
 * Returns the number of non-loyalty coupons in basket
 * @function getNumberOfNonLoyaltyCouponsInBag
 * @memberof Coupon
 * @param {Array[dw.order.CouponLineItem]} coupons - An array of coupon objects to be evaluated.
 * @return {Number} The count of non-loyalty coupons in the input array.
 */
function getNumberOfNonLoyaltyCouponsInBag(coupons) {
    let count = 0;
    coupons = coupons.toArray()
    coupons.forEach(coupon => {
        const couponObj = CouponMgr.getCouponByCode(coupon.couponCode);
        if (!empty(couponObj) &&
            (getCouponType(couponObj.ID) === 'offer' || getCouponType(couponObj.ID) === 'default')) {

            // Convert promotions to array and check if all are based on coupons
            const promotionsArray = CouponMgr.getCoupon(couponObj.ID).getPromotions().toArray();
            const allBasedOnCoupons = promotionsArray.length > 0 && promotionsArray.every(promo => promo.basedOnCoupon);

            if (allBasedOnCoupons) {
                count = count + 1;
            }
        }
    });

    return count;
}

/**
 * Returns the feature toggle state
 * @function getFeatureToggleState
 * @memberof Coupon
 * @param {*} customPreferenceValue
 * @returns {object}
 */
function getFeatureToggleState (customPreferenceValue) {
    let featureToggleState;
    if (!empty(session.custom.featuretoggles)) {
        let featureFlags  = JSON.parse(session.custom.featuretoggles);
        Object.keys(featureFlags).forEach(function (key) {
            if (featureFlags[key]['sitePreference'] === customPreferenceValue) {
                featureToggleState = featureFlags[key]['state'];
            }
        });
    }
    return featureToggleState;
}

/**
 * check if customer belongs to "loyalty" customers group
 * @function isLoyaltyCustomer
 * @memberof Coupon
 * @param {Customer} : dw.customer.Customer
 * @returns {boolean}
*/
function isLoyaltyCustomer(customer) {
    const loyaltyGroupID = Site.getCustomPreferenceValue('LoyaltyCustomerGroupID_Customers');
    if (loyaltyGroupID && !empty(customer) && customer != undefined) {
        return customer.isMemberOfCustomerGroup(loyaltyGroupID);
    }
    return false;
}


/**
 * Checks if a coupon line item is valid based on the pre checks
 * @function validateCouponCode
 * @memberof Coupon
 * @param {dw.order.CouponLineItem} couponLineItem the sfcc request coupon object
 * @return {boolean}
 */
function isValidCouponCode(couponLineItem) {
    if (empty(couponLineItem.couponCode)) {
        return false;
    }
    const coupon = CouponMgr.getCouponByCode(couponLineItem.couponCode);
    if (empty(coupon) || !coupon.enabled || !hasActivePromo(coupon)) {
        return false;
    }
    if (!empty(coupon.redemptionLimitPerCode) && coupon.redemptionLimitPerCode <= CouponMgr.getRedemptions(coupon.ID, couponLineItem.couponCode).length) {
        return false;
    }
    return true;
}


module.exports = {
    hasActivePromo,
    getCouponType,
    getCurrentCouponLimit,
    getNumberOfNonLoyaltyCouponsInBag,
    isLoyaltyCustomer,
    isValidCouponCode
};
