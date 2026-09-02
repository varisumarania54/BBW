'use strict';

/**
 * Ordergroove Helper Methods
 *
 */

 var Site = require('dw/system/Site');
 var PromotionMgr = require('dw/campaign/PromotionMgr');

/**
* To check Basket has any AR promotion applied or not.
* Return True - if any AR OrderLevel/productLevel promotion applied
* Return false - No AR promotions applied into Basket.
 */
function checkCartHasARPromotion ( basket ) {
	var isARCouponApplied = false;

	// check ProductLineItem priceAdjustments for PRODUCT level Promotion.
    var allProductlineitems = basket.getProductLineItems().iterator();
    while(allProductlineitems.hasNext()) {
        var lineitem = allProductlineitems.next();
        var priceAdjustments =  lineitem.getPriceAdjustments();
        if (priceAdjustments.size() > 0) {
            var iterator = priceAdjustments.iterator();
                var lineItemPriceAdj = null;
            while(iterator.hasNext()) {
                lineItemPriceAdj = iterator.next();
                if ('promotionID' in lineItemPriceAdj && !empty(lineItemPriceAdj.promotionID) && lineItemPriceAdj.promotionID == 'OG-Promo-'+lineitem.getUUID()) {
                    isARCouponApplied = true;
                }
            }
        }
    }

	return isARCouponApplied;
}

/**
* Check if LineItem is subscribed or not
* Return true or false based on pli attributes
 */
function isARLineItem(pli, params) {
    var ogParam = 'og-subscription-'+ pli.getUUID();
    if ( ogParam in params && !empty(params[ogParam]) && !empty(params[ogParam].stringValue))  {
        if (params[ogParam].stringValue == 'true' &&
            (!empty(pli.product.custom.productBadgeIcon) && pli.product.custom.productBadgeIcon.value.equalsIgnoreCase('autorefresh'))){
            return true;
        } else {
            return false;
        }
    } else if (!empty(pli.custom) && 'isAutoRefreshSubscribedItem' in pli.custom && pli.custom.isAutoRefreshSubscribedItem && (!empty(pli.product.custom.productBadgeIcon) && pli.product.custom.productBadgeIcon.value.equalsIgnoreCase('autorefresh'))) {
        return true;
    } else {
        return false;
    }
}

/**
* Remove all PriceAdjustments on PLI
 */
function removePLIPriceAdjustments(pli) {
    var adjToRemove = pli.getPriceAdjustments();
    if(adjToRemove.size() > 0) {
        for each (var adj in adjToRemove) {
            pli.removePriceAdjustment(adj);
        }
    }
}

/**
* Remove AR PriceAdjustments from PLI
 */
function removeARPriceAdjustments(pli) {
    var adjustment = pli.getPriceAdjustmentByPromotionID("OG-Promo-" + pli.getUUID());
    if (adjustment != null) {
        pli.removePriceAdjustment( adjustment );
    }
}

/**
* Add AR PriceAdjustment on PLI
 */
function addARPriceAdjustment(pli, prdpromo, isARPromoCall, discountoff) {
    var adjustment = pli.getPriceAdjustmentByPromotionID("OG-Promo-" + pli.getUUID());
    if (adjustment == null && (prdpromo != null && prdpromo.isActive())) {
        var discount = prdpromo.custom.IOIPercentOff;
        var priceAdjustment = pli.createPriceAdjustment("OG-Promo-" + pli.getUUID(), new dw.campaign.PercentageDiscount(discount));
        priceAdjustment.setLineItemText(prdpromo.calloutMsg);
    }else if (adjustment == null && (isARPromoCall == true && discountoff)) {
        var discount = discountoff;
        var priceAdjustment = pli.createPriceAdjustment("OG-Promo-" + pli.getUUID(), new dw.campaign.AmountDiscount(discount));
        priceAdjustment.setLineItemText('OG promotion');
    } else if (prdpromo != null && prdpromo != 'undefined' && !(prdpromo.isActive())) {
        pli.removePriceAdjustment( adjustment );
    }
}

/**
* Get AR Promotion object
 */
function getARProductPromotion() {
    var promo = null;
    if ('OrderGroovePromoEnable' in Site.current.preferences.custom && Site.current.preferences.custom.OrderGroovePromoEnable) {
        promo = PromotionMgr.getPromotion(Site.current.preferences.custom.OrderGroovePromoID);
    }
    return promo;
}

/* Module export for controllers */
module.exports = {
    checkCartHasARPromotion : checkCartHasARPromotion,
    isARLineItem : isARLineItem,
    removePLIPriceAdjustments : removePLIPriceAdjustments,
    removeARPriceAdjustments : removeARPriceAdjustments,
    addARPriceAdjustment : addARPriceAdjustment,
    getARProductPromotion : getARProductPromotion
};
