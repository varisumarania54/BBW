/**
 * A namespace.
 * @namespace orderGroove
 */
'use strict';

const Site = require('dw/system/Site').getCurrent();
const PromotionMgr = require('dw/campaign/PromotionMgr');
const autoRefreshHelper = require('int_ordergroove/cartridge/scripts/autoRefreshHelper.js');

/**
 * Determines if the current basket is applicable for the OG promo and Adds / removes it where neccesary.
 *
 * @param {dw.order.Basket} basket - The current Basket
 */
function applyOGPromoToBasket(basket) {
    if (Site.getCustomPreferenceValue('OrderGrooveEnable') && Site.getCustomPreferenceValue('OrderGroovePromoEnable')) {
        const autoRefreshShippingPromoID = ('OrderGrooveShippingPromoID' in Site.preferences.custom) ? Site.preferences.custom.OrderGrooveShippingPromoID : '';
        const productPromo = getOGProductPromo();
        basket.allShippingPriceAdjustments.toArray().forEach(pa => {
            if ('promotionID' in pa && pa.promotionID.indexOf('OG-Promo') > -1) {
                basket.removeShippingPriceAdjustment(pa);
            }
        });
        if (!empty(productPromo)) {
            let autoRefreshTotalAmount = 0;
            const shippingPromo = PromotionMgr.getPromotion(autoRefreshShippingPromoID);
            const autoRefreshShippingFreeMinAmount = ('OrderGrooveShippingFreeMinAmount' in Site.preferences.custom) ? parseFloat(Site.preferences.custom.OrderGrooveShippingFreeMinAmount) : 30;
            const allowedShippingMethod = Site.preferences.custom.OrderGrooveShippingMethod || '';
            basket.shipments.toArray().forEach(shipment => {
                //Product Level price adjustments
                shipment.productLineItems.toArray().forEach(pli => {
                    if (empty(pli.custom.fromStoreId) && pli.custom.isAutoRefreshSubscribedItem) {
                        // check if AR is applied for PLI and apply priceadjustment
                        let adjustment = pli.getPriceAdjustmentByPromotionID('OG-Promo-' + pli.getUUID());
                        if (empty(adjustment)) {
                            autoRefreshHelper.removePLIPriceAdjustments(pli);
                            if (productPromo && productPromo.promotionClass == 'PRODUCT') {
                                autoRefreshHelper.addARPriceAdjustment(pli, productPromo);
                            } else if (productPromo && productPromo.promotionClass == 'ORDER') {
                                //add order level promo here
                            }
                        }
                        // calculate AR PLI amount
                        autoRefreshTotalAmount = autoRefreshTotalAmount + pli.adjustedPrice.value;
                    } else {
                        // remove AR price adjustment for non AR PLIs
                        autoRefreshHelper.removeARPriceAdjustments(pli);
                        pli.custom.orderGrooveFrequency = '';
                        pli.custom.orderGrooveFrequencytime = '';
                        pli.custom.isAutoRefreshSubscribedItem = false;
                    }
                });
                //Check Shipment lvl
                if (autoRefreshTotalAmount >= autoRefreshShippingFreeMinAmount && autoRefreshShippingPromoID && !empty(shippingPromo) && shippingPromo.isActive()) {
                    if (empty(shipment.custom.fromStoreId) && 'shippingMethodID' in shipment && allowedShippingMethod && shipment.shippingMethodID == allowedShippingMethod) {
                        shipment.getShippingLineItems().toArray().forEach(li => {
                            let promoAlreadyApplied = false;
                            var adjustments = li.getShippingPriceAdjustments();
                            adjustments.toArray().forEach(adj => {
                                if (adj.promotionID.indexOf('OG-Promo-Shipping') > -1) {
                                    promoAlreadyApplied = true;
                                } else if (!empty(adj.promotion) && adj.promotion.basedOnCoupon && !empty(adj.couponLineItem)) {
                                    basket.removeCouponLineItem(basket.getCouponLineItem(adj.couponLineItem.couponCode)); //remove other shipping price adjustments based on coupon
                                } else {
                                    li.removeShippingPriceAdjustment(adj); // remove other shipping price adjustments
                                }
                            });

                            if (!promoAlreadyApplied) {
                                let priceAdjustment = li.createShippingPriceAdjustment('OG-Promo-Shipping-' + li.getUUID(), new dw.campaign.PercentageDiscount(shippingPromo.custom.IOIPercentOff));
                                priceAdjustment.setLineItemText(shippingPromo.calloutMsg);
                            }
                        })
                    }
                }
                else {
                    shipment.getShippingLineItems().toArray().forEach(li => {
                        let OGAdjustment = li.shippingPriceAdjustments.toArray().find(e => 'promotionID' in e && e.promotionID.indexOf('OG-Promo') > -1);
                        if (!empty(OGAdjustment)) {
                            li.removeShippingPriceAdjustment(OGAdjustment)
                        }
                    });
                }
            });
        }
    }
}

/**
 * Gets the product based OG promotion.
 *
 */
function getOGProductPromo() {
    const autoRefreshPromoID = ('OrderGroovePromoID' in Site.preferences.custom) ? Site.preferences.custom.OrderGroovePromoID : '';
    return PromotionMgr.getPromotion(autoRefreshPromoID);
}

/**
 * Removes all duplicate OG product line items that have lower quantity
 * @param {dw.order.Basket} basket - post merge basket
 * @returns {void}
 */
function mergeOGLineItems(basket) {
    let lineItems = new Map();
    const productLineItems = basket.getAllProductLineItems().toArray();

    // Set a map of highest quantity OG product lines items by product id (duplicates)
    productLineItems.forEach(pli => {
        if (pli.custom.isAutoRefreshSubscribedItem) {
            let existing = lineItems.get(pli.productID);
            if (!existing || pli.quantity.value > existing.quantity) {
                lineItems.set(pli.getProductID(), { uuid: pli.getUUID(), quantity: pli.getQuantityValue() });
            }
        }
    });

    // // Find all duplicates by checking lineItems map and if the UUID does not match remove the product line item
    productLineItems.forEach(pli => {
        if (pli.custom.isAutoRefreshSubscribedItem) {
            let lineItem = lineItems.get(pli.productID);
            if (lineItem && lineItem.uuid !== pli.getUUID()) {
                basket.removeProductLineItem(pli);
            }
        }
    });
}

/**
 * Removes Order Groove related properties and price adjustments from the basket's product line items
 * if the Order Groove feature is disabled in custom preferences.
 *
 * @param {dw.order.Basket} basket - The basket object containing product line items to inspect.
 * @return {void} This function does not return a value; it modifies the basket directly.
 */
function removeOGFromBasket(basket) {
    if (!Site.getCustomPreferenceValue('OrderGrooveEnable')) {
        const autoRefreshHelper = require('int_ordergroove/cartridge/scripts/autoRefreshHelper.js');

        basket.allShippingPriceAdjustments.toArray().forEach(pa => {
            if ('promotionID' in pa && pa.promotionID.indexOf('OG-Promo') > -1) {
                basket.removeShippingPriceAdjustment(pa);
            }
        });

        basket.shipments.toArray().forEach(shipment => {
            //Product Level price adjustments
            shipment.productLineItems.toArray().forEach(pli => {
                if (pli.custom.isAutoRefreshSubscribedItem) {
                    autoRefreshHelper.removeARPriceAdjustments(pli);
                    pli.custom.orderGrooveFrequency = '';
                    pli.custom.orderGrooveFrequencytime = '';
                    pli.custom.isAutoRefreshSubscribedItem = false;
                }
            });
        });
    }
}

/**
 * Remove auto refresh items where the product is not auto refresh enabled
 * @param {dw.order.Basket} basket - post merge basket
 */
function clearInvalidOGAttributes(basket) {
    basket.shipments.toArray().forEach(shipment => {
        shipment.productLineItems.toArray().forEach(pli => {
            if (pli.custom.isAutoRefreshSubscribedItem && pli.product && !pli.product.custom.autoRefresh) {
                autoRefreshHelper.removeARPriceAdjustments(pli);
                if ('orderGrooveFrequency' in pli.custom && pli.custom.orderGrooveFrequency) {
                    pli.custom.orderGrooveFrequency = '';
                }
                if ('orderGrooveFrequencytime' in pli.custom && pli.custom.orderGrooveFrequencytime) {
                    pli.custom.orderGrooveFrequencytime = '';
                }
                pli.custom.isAutoRefreshSubscribedItem = false;
            }
        });
    });
}

/**
 * Set Subscribed items to false during merge, we only have access to basket
 * after merge so we do not know which subscribed duration to use, guest vs logged in
 * basket
 * @param {dw.order.Basket} basket - post merge basket
 */
function removeOGPropertyOnMerge(basket) {
    if (!empty(Site.preferences.custom.removeOGpropertyOnMerge) && Site.preferences.custom.removeOGpropertyOnMerge) {
        const productLineItems = basket.getAllProductLineItems().toArray();
        productLineItems.forEach(pli => {
            if (pli.custom.isAutoRefreshSubscribedItem) {
                pli.custom.isAutoRefreshSubscribedItem = false;
            }
        });
    }
}

module.exports = {
    applyOGPromoToBasket,
    getOGProductPromo,
    mergeOGLineItems,
    removeOGFromBasket,
    clearInvalidOGAttributes,
    removeOGPropertyOnMerge
}

