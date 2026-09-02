'use strict';

/**
 * @module calculate.js
 *
 * This javascript file implements methods (via Common.js exports) that are needed by
 * the new (smaller) CalculateCart.ds script file.  This allows OCAPI calls to reference
 * these tools via the OCAPI 'hook' mechanism
 *
 */
const HashMap = require('dw/util/HashMap');
const PromotionMgr = require('dw/campaign/PromotionMgr');
const ShippingMgr = require('dw/order/ShippingMgr');
const ShippingLocation = require('dw/order/ShippingLocation');
const TaxMgr = require('dw/order/TaxMgr');
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler.logger;
const Site = require('dw/system/Site').getCurrent();
// const EmployeeDiscountHelper = require('org_bathandbodyworks/cartridge/scripts/cart/employeeDiscount/Helper.js');
const CouponMgr = require('dw/campaign/CouponMgr');
const CouponHelper = require('app_composable/cartridge/scripts/helpers/objects/coupon.js');
const OrderLimitsHelper = require('app_composable/cartridge/scripts/helpers/global/BopisOrderLimits.js');
const BasketHelper = require('app_composable/cartridge/scripts/helpers/objects/basket.js');
const BopisHelper = require('app_composable/cartridge/scripts/helpers/objects/BasketComponents/BopisHelper.js');
const bagFeeSkus = BopisHelper.getBagFeeSKUs();
const StringUtils = require('dw/util/StringUtils');
const ProductMgr = require('dw/catalog/ProductMgr');
const OGHelper = require("int_ordergroove/cartridge/scripts/composable/promotionHelper.js");
const ShipmentHelper = require('app_composable/cartridge/scripts/helpers/objects/shipment.js');
const Money = require('dw/value/Money');
const Resource = require("dw/web/Resource");

/**
 * @function calculate
 *
 * calculate is the arching logic for computing the value of a basket.  It makes
 * calls into cart/calculate.js and enables both SG and OCAPI applications to share
 * the same cart calculation logic.
 *
 * @param {object} basket The basket to be calculated
 * @param {boolean} skipTax flag to determine if we should call tax calucation logic
 */
exports.calculate = function (basket, skipTax) {
    if (request.SCAPI || request.custom.isPlaceOrderGroove) {

        /**
         * Remove Giftcards as GCLIs for rebuild if we are treating GCs as product line items
         * in Rebuild
         */
        if (Site.getCustomPreferenceValue('treatGiftCardsAsProductLineItems')) {
            basket.getGiftCertificateLineItems().toArray().forEach(gcli => basket.removeGiftCertificateLineItem(gcli));
        }

        BasketHelper.removeEmptyShipments(basket, basket.custom.preferredStore);
        if (Site.getCustomPreferenceValue('EnableSyncMissmatchedStoreIds')) {
            try {
                let BOPISShipments = basket.shipments.toArray().filter(e => !empty(e.custom.fromStoreId) && !empty(e.custom.shipmentType) && e.custom.shipmentType === 'instore')
                const store = dw.catalog.StoreMgr.getStore(basket.custom.preferredStore);
                const billingAddress = basket.billingAddress
                if (!empty(billingAddress) && !empty(billingAddress.address1) && !empty(store) && !empty(store.address1) && billingAddress.address1.toLowerCase() == store.address1.toLowerCase()) {
                    billingAddress.address1 = null;
                    billingAddress.address2 = null;
                    billingAddress.phone = null;
                    billingAddress.postalCode = null;
                    billingAddress.stateCode = null;
                    billingAddress.city = null;
                    billingAddress.firstName = null;
                    billingAddress.lastName = null;
                }
                if (!empty(BOPISShipments)) {
                    if (!empty(store)) {
                        BOPISShipments.forEach(BOPISShipment => {
                            if (BOPISShipment.custom.fromStoreId !== basket.custom.preferredStore || BOPISShipment.productLineItems.toArray().some(e => e.custom.fromStoreId !== basket.custom.preferredStore)) {
                                logHandler.info({ message: 'BBWDP-19816 store changed block 1 Store was : ' + BOPISShipment.custom.fromStoreId + 'changed to  : ' + basket.custom.preferredStore }, 'Hooks', 'Calculate');
                                BOPISShipment.custom.fromStoreId = basket.custom.preferredStore;
                                BOPISShipment.productLineItems.toArray().forEach(pli => {
                                    pli.custom.fromStoreId = basket.custom.preferredStore;
                                })
                            }
                            if (empty(BOPISShipment.shippingAddress)) {
                                let newShippingAddress = BOPISShipment.createShippingAddress();
                                logHandler.info({ message: 'BBWDP-35298 missing ispu shipment address created:' + newShippingAddress.getUUID() + '(uuid)' }, 'Hooks', 'Calculate');
                            }
                            if (!empty(BOPISShipment.getProductLineItems()) && BOPISShipment.shippingAddress.address1 !== store.address1) {
                                logHandler.info({ message: 'BBWDP-19816 store changed block 2 Address1  was : ' + BOPISShipment.shippingAddress.address1 + ' changed to  : ' + store.address1 }, 'Hooks', 'Calculate');
                                BOPISShipment.shippingAddress.setAddress1(store.address1);
                                BOPISShipment.shippingAddress.setAddress2(store.address2);
                                BOPISShipment.shippingAddress.setCity(store.city);
                                BOPISShipment.shippingAddress.setPostalCode(store.postalCode);
                                BOPISShipment.shippingAddress.setStateCode(store.stateCode);
                                BOPISShipment.shippingAddress.setCountryCode(store.countryCode.value);
                                BOPISShipment.shippingAddress.setPhone(store.phone);
                                BOPISShipment.shippingAddress.setFirstName(store.name);
                                BOPISShipment.shippingAddress.setLastName(' ');
                            }
                        });
                    }
                }
            }
            catch (e) {
                logHandler.error(e, 'Hooks', 'Calculate');
            }

        }

        if (Site.getCustomPreferenceValue('hideCouponField') &&
            !session.userAuthenticated &&
            basket.getCouponLineItems().length > 0
        ) {
            let couponRemoved = false;
            basket.getCouponLineItems().toArray().filter(cli => ['default', 'offer'].includes(CouponHelper.getCouponType(CouponMgr.getCouponByCode(cli.couponCode).ID)))
                .forEach((cli) => {
                    basket.removeCouponLineItem(cli);
                    couponRemoved = true;
                })
            if (couponRemoved) {
                BasketHelper.handleAddingDissmisableMessages(basket, 'couponFieldHidden')
            }
        }

        if (!empty(basket.couponLineItems.toArray())) {
            const removeBasketCouponsIfOverLimit = require('app_composable/cartridge/scripts/helpers/shopperBaskets/couponHelper.js').removeBasketCouponsIfOverLimit;
            removeBasketCouponsIfOverLimit(basket);
        }

        /**
         * Clear any Expird Coupons on the basket
         */

        BasketHelper.clearExpiredCoupon(basket);

        if (Site.getCustomPreferenceValue('EnableMultipleCoupons')) {
            var couponsinbasket = basket.couponLineItems.toArray()

            let nonLoyaltyCoupons = couponsinbasket.map(coupon => {
                let couponObj = CouponMgr.getCouponByCode(coupon.couponCode);
                let couponType = CouponHelper.getCouponType(couponObj.ID);
                return { couponLineItem: coupon, couponObj: couponObj, couponType: couponType }
            }).filter(e => e.couponType === 'default' || e.couponType === 'offer');

            if (nonLoyaltyCoupons.length > 1 && nonLoyaltyCoupons.length > CouponHelper.getCurrentCouponLimit()) {
                nonLoyaltyCoupons.forEach(obj => {
                    basket.removeCouponLineItem(obj.couponLineItem)
                });
            }
        }

        if (Site.getCustomPreferenceValue('EnableShippingWithBopisAttributes')) {
            fixBadShippingShipments(basket);
        }

        if (Site.getCustomPreferenceValue('EnableMergeDuplicateProductItems')) {
            fixProductsOnShipments(basket);
        }

        if (Site.getCustomPreferenceValue("EnforceCategoryLimitsInCalculate")) {
            checkLimitsAndUpdate(basket);
        }

        /**
         * Calculate: product line item prices
         */

        calculateProductPrices(basket);

        /*
        * Calculate: gift certificate prices
        */

        calculateGiftCertificatePrices(basket);

        /**
         * Apply: promotional discounts
         * Must be applied after gross price tax calculation and before shipping calculation.
         * Skip if the basket has not changed since the last calculation.
         */
        BasketHelper.updateBasketState(basket);
        let basketHasAR = basket.getProductLineItems().toArray().some(pli => pli.custom.isAutoRefreshSubscribedItem);
        if (!request.custom.skipCartCal) {
            OGHelper.clearInvalidOGAttributes(basket);
            OGHelper.removeOGFromBasket(basket);
            OGHelper.applyOGPromoToBasket(basket);
            //This must be done before and after applying shipping costs.
            PromotionMgr.applyDiscounts(basket);
            ShippingMgr.applyShippingCost(basket);
            calculateGiftCardShipping(basket);
            PromotionMgr.applyDiscounts(basket);
            if (Site.getCustomPreferenceValue('EnableFulfillmentSpecificPromo')) {
                checkCouponForSpecificFulfillmentType(basket)
            }
            if (Site.getCustomPreferenceValue("EnforceMaxPriceOnPromos")) {
                ensurePromotionsNotOverMax(basket);
            }
            // Remove Non-AR order level promotions from Basket if AR promotion Applied in the Basket
            if (basketHasAR) {
                handleOG(basket);
            }

            /**
             * Since we might have bonus product line items, we need to
             * reset product prices
             */

            calculateProductPrices(basket);

            /**
             * Calculate: estimated tax
             * Run sfcc tax table estimates when the basket has changed
             * and all scenarios prior to Order Summary.
             */
            let skipSfccTax = !empty(skipTax) ? skipTax : request.custom.skipTax;
            if (!skipSfccTax) {
                calculateTax(basket);
            }
            basket.updateTotals();
            BasketHelper.updateBasketState(basket);
        }
        calculatePIAmount(basket);

        if (Site.getCustomPreferenceValue('doValidateOnCalculate')) {
            let result = BasketHelper.validate(basket);
            if (!empty(result)) {
                basket.custom.enableCheckout = result.EnableCheckout;
                basket.custom.basketStatusMessage = result.BasketStatus.getMessage();
                basket.custom.basketStatusCode = result.BasketStatus.getCode();
            }
        }
        BasketHelper.clearExpiredCoupon(basket);

        //Keeping the bool consistend with above Not implemented yest in ecom so useless to be uncommented.
        // if (!Site.getCustomPreferenceValue('EmployeeDiscountEnabled')) {
        //     delete session.custom.employee;
        // }
        // if (session.custom.employee) {
        //     const empPromotion = PromotionMgr.getPromotion(Site.getCustomPreferenceValue("EmployeeDiscountPromoId"));
        //     if (!empty(empPromotion) && empPromotion.active) {
        //         EmployeeDiscountHelper.applyEmployeeDiscountOnBasket(basket, empPromotion);
        //         if (basketHasAR) {
        //             handleOG(basket);
        //         }
        //         calculateTax(basket);
        //         basket.updateTotals();
        //         BasketHelper.updateBasketState(basket);
        //     }
        // }
        if (basketHasAR) {
            updateOrderGrooveSubscriptionOptins(basket);
        }
        handleSmS(basket);

        return new dw.system.Status(dw.system.Status.OK);
    }

};

/**
 * Handles maintaining the sms contact number
 * @function handleSmS
 * @module Calculate
 * @param {Basket} basket
 */
function handleSmS(basket) {
    if (!empty(Site.getCustomPreferenceValue('enableBopisSMSSignup')) && Site.getCustomPreferenceValue('enableBopisSMSSignup')) {
        let smsShipment = basket.shipments.toArray().find(e => e.custom.smsOptIn);
        if (!empty(smsShipment) && !empty(basket.billingAddress) && empty(smsShipment.custom.smsContactNumber)) {
            smsShipment.custom.smsContactNumber = basket.billingAddress.phone;
        }
        basket.shipments.toArray().filter(e => empty(e.custom.smsOptIn) || !e.custom.smsOptIn || !e.shippingMethod.custom.storePickupEnabled).forEach(shipment => {
            shipment.custom.smsContactNumber = null;
            shipment.custom.smsOptIn = false;
        });
    }
}

/**
 * Handles mergeing duplicate product line items that share the same shipment and productId
 * @function handleSmS
 * @module Calculate
 * @param {Basket} basket
 */
function fixProductsOnShipments(basket) {
    basket.getShipments().toArray().forEach(shipment => {
        let duplicatePlis = {};
        shipment.getProductLineItems().toArray().forEach(pli => {
            if (!pli.custom.isGiftCard && !pli.bonusProductLineItem) {
                if (!empty(duplicatePlis[pli.productID])) {
                    duplicatePlis[pli.productID].push(pli);
                }
                else {
                    duplicatePlis[pli.productID] = [pli];
                }
            }
        });
        for (let key in duplicatePlis) {
            let pliArray = duplicatePlis[key]
            if (pliArray.length > 1) {
                let endQuantity = pliArray.reduce((a, b) => a + b.quantityValue, 0);
                basket.getProductLineItems().toArray().find(e => e.UUID === pliArray[0].UUID).setQuantityValue(endQuantity);
                pliArray.slice(1).forEach(pli => {
                    basket.removeProductLineItem(pli);
                });
                logHandler.info({ message: "BBWDP-29910 duplicate line items for sku " + key }, 'Hooks', 'Calculate');
            }
        }
    });
}
/**
 * Handles adding the required subscription data to the basket
 * @function updateOrderGrooveSubscriptionOptins
 * @module Calculate
 * @param {Basket} basket
 */
function updateOrderGrooveSubscriptionOptins(basket) {
    const sessionID = Site.getCustomPreferenceValue('OrderGrooveMerchantID');
    const offerID = Site.getCustomPreferenceValue('OrderGrooveOfferID');
    let data = []
    basket.productLineItems.toArray().filter(pli => pli.custom.isAutoRefreshSubscribedItem).forEach(pli => {
        data.push({
            product: pli.productID,
            subscription_info: { components: [] },
            tracking_override: {
                offer: offerID,
                session_id: sessionID,
                every: new Number(pli.custom.orderGrooveFrequency),
                every_period: pli.custom.orderGrooveFrequencytime ? new Number(pli.custom.orderGrooveFrequencytime) : 3
            }
        })
    });
    basket.custom.subscriptionOptins = JSON.stringify(data);
}

/**
 * Checks the purchase limit for each item on basket and updates to the max applicable to buy when applicable.
 * @function checkLimitsAndUpdate
 * @module Calculate
 * @param {Basket} basket
 */
function checkLimitsAndUpdate(basket) {
    basket.getProductLineItems().toArray().forEach(pli => {
        let limit = OrderLimitsHelper.getPurchaseLimit(pli.product, pli.custom.fromStoreId);
        if (!empty(limit) && limit < pli.getQuantityValue()) {
            pli.setQuantityValue(limit);
        }
    });
}

/**
 * Ensure % off promos do not exceed the max amount off posible
 * @function ensurePromotionsNotOverMax
 * @module Calculate
 * @param {Basket} basket
 */
function ensurePromotionsNotOverMax(basket) {
    basket.getPriceAdjustments().toArray().forEach((priceAdj) => {
        let discount = priceAdj.appliedDiscount;
        if (!empty(discount) &&
            discount.getType() === dw.campaign.Discount.TYPE_PERCENTAGE &&
            !empty(priceAdj.promotion) &&
            'maximumDiscount' in priceAdj.promotion.custom &&
            !empty(priceAdj.promotion.custom.maximumDiscount) &&
            priceAdj.netPrice * -1 > priceAdj.promotion.custom.maximumDiscount) {
            priceAdj.setPriceValue(-priceAdj.promotion.custom.maximumDiscount)
        }
    })
}


/**
 * Shipments have the proper shipment properties and that only 1 bopis and 1 STH shipment exsists
 * @function fixBadShippingShipments
 * @module Calculate
 * @param {Basket} basket
 */
function fixBadShippingShipments(basket) {
    let shippingShipments = [];
    let bopisShipments = [];
    let validShipments = basket.getShipments().toArray().filter(e => !empty(e.shippingMethodID) && !empty(e.shippingMethod));
    validShipments.forEach(shipment => {
        if (!empty(shipment.shippingMethod.custom) && 'storePickupEnabled' in shipment.shippingMethod.custom && !shipment.shippingMethod.custom.storePickupEnabled) {
            shippingShipments.push(shipment.getID());
            shipment.custom.shipmentType = '';
            shipment.custom.fromStoreId = '';
        }
        else if (!empty(shipment.custom.fromStoreId) && shipment.custom.shipmentType === 'instore') {
            bopisShipments.push(shipment.getID());
        }
    });
    if (shippingShipments.length > 1) {
        mergeShipments(shippingShipments, basket);
    }

    if (Site.getCustomPreferenceValue('EnableSyncMissmatchedStoreIds') && bopisShipments.length > 1) {
        mergeShipments(bopisShipments, basket);
    }
}

/**
 * Merge X  shipments together
 * @function mergeShipments
 * @module Calculate
 * @param {[String]} shipmentIds
 * @param {Basket} basket
 */
function mergeShipments(shipmentIds, basket) {
    var primaryShipmentId = shipmentIds.indexOf('me') !== -1 ? 'me' : shipmentIds[0];
    var pliIds = [];
    basket.getAllProductLineItems().toArray().forEach(pli => {
        var pliShipmentId = pli.getShipment().ID;
        if (shipmentIds.indexOf(pliShipmentId) !== -1) {
            if (pliShipmentId === primaryShipmentId) {
                pliIds.push(pli.productID)
                pli.custom.fromStoreId = null;
            }
            else {
                if (pliIds.indexOf(pli.productID) !== -1) {
                    let primaryLine = basket.getAllProductLineItems(pli.productID).toArray().find(pli => pli.getShipment().ID === primaryShipmentId);
                    primaryLine.setQuantityValue(primaryLine.getQuantityValue() + pli.getQuantityValue());
                    basket.removeProductLineItem(pli);
                    pli.custom.fromStoreId = null;
                }
                else {
                    pli.setShipment(basket.getShipment(primaryShipmentId));
                    pli.custom.fromStoreId = null;
                }
            }
        }
    });
    basket.getGiftCertificateLineItems().toArray().forEach(gcli => {
        if (shipmentIds.indexOf(gcli.getShipment().ID) !== -1) {
            gcli.setShipment(basket.getShipment(primaryShipmentId));
        }
    });
    basket.getShipments().toArray().forEach(shipment => {
        if (shipment.getID() != primaryShipmentId && shipmentIds.indexOf(shipment.getID()) !== -1) {
            basket.removeShipment(shipment);
        }
    });

    let bagfee = basket.getAllProductLineItems().toArray().find(e => bagFeeSkus.some(sku => sku === e.productID));
    if (!empty(bagfee)) {
        if (shipmentIds.indexOf(bagfee.shipment.ID) !== -1) {
            basket.removeProductLineItem(bagfee);
        }
    }
}

/**
 * Handle the enforcement of fulfillment specific coupons on basket
 * @function checkCouponForSpecificFulfillmentType
 * @module Calculate
 * @param {Basket} basket
 */
function checkCouponForSpecificFulfillmentType(basket) {
    let fulfillmentBasedCoupons = basket.getCouponLineItems().toArray().map(cli => {
        let coupon = CouponMgr.getCouponByCode(cli.couponCode);
        if (coupon) {
            let fulfillmentPromotions = coupon.promotions.toArray().filter(e => e.isEnabled() && "FulfillmentType" in e.custom && !empty(e.custom.FulfillmentType));
            return { cli: cli, promotions: fulfillmentPromotions, hasFulfillmentPromos: !empty(fulfillmentPromotions) };
        }
        return null;
    });
    fulfillmentBasedCoupons = fulfillmentBasedCoupons.filter(e => !empty(e) && e.hasFulfillmentPromos);
    if (fulfillmentBasedCoupons.length > 0) {
        let typeOfBag = BasketHelper.getBasketType(basket);
        let nonApplicableCoupons = fulfillmentBasedCoupons.filter(obj => obj.promotions.some(e => e.custom.FulfillmentType.value != typeOfBag));
        nonApplicableCoupons.forEach(obj => {
            obj.cli.priceAdjustments.toArray().forEach(pa => {
                basket.productLineItems.toArray().forEach(pli => {
                    pli.removePriceAdjustment(pa)
                });
            });
            if (empty(obj.cli.priceAdjustments)) {
                if (empty(basket.custom.preferredStore) && obj.promotions[0].custom.FulfillmentType.value == "BOPIS") {
                    basket.custom.couponBannerMsg = Resource.msg('BOPISONLY_COUPON_NO_STORESELECTED', 'cart', null);
                }
                else if (obj.promotions[0].custom.FulfillmentType.value == "BOPIS" && typeOfBag == "STH") {
                    basket.custom.couponBannerMsg = Resource.msg('NOT_MIXED_BOPIS_COUPON', 'cart', null);
                }
                else if (obj.promotions[0].custom.FulfillmentType.value == "STH" && typeOfBag == "BOPIS") {
                    basket.custom.couponBannerMsg = Resource.msg('NOT_MIXED_STH_COUPON', 'cart', null);
                }
                else if (typeOfBag == "MIXED") {
                    basket.custom.couponBannerMsg = Resource.msg(StringUtils.format('MIXEDBAG_{0}', obj.promotions[0].custom.FulfillmentType.value), 'cart', null);
                } else {
                    basket.custom.couponBannerMsg = null;
                }
            }
            else {
                basket.custom.couponBannerMsg = null;
            }
        });
        if (empty(nonApplicableCoupons)) {
            basket.custom.couponBannerMsg = null;
        }
    }
    else {
        basket.custom.couponBannerMsg = null;
    }
}

/**
 * Handle the enforcement of Og Rules on price adjustments
 * @function handleOG
 * @module Calculate
 * @param {Basket} basket
 */
function handleOG(basket) {
    // Remove Non-AR order level promotions from Basket if AR promotion Applied in the Basket
    if (Site.getCustomPreferenceValue('OrderGrooveEnable') && Site.getCustomPreferenceValue('OrderGroovePromoEnable')) {
        basket.getShipments().toArray().filter(shipment => 'shippingMethodID' in shipment && shipment.shippingMethodID != 'ISPU').forEach(shipment => {
            shipment.getProductLineItems().toArray().
                filter(pli => pli.custom.isAutoRefreshSubscribedItem)
                .forEach(pli => {
                    pli.getPriceAdjustments().toArray().forEach(adj => {
                        if (!empty(adj.promotion) && adj.promotion.isBasedOnCoupons() && !empty(adj.couponLineItem)) {
                            basket.removeCouponLineItem(basket.getCouponLineItem(adj.couponLineItem.couponCode));
                        } else if ('promotionID' in adj && adj.promotionID.indexOf('OG-Promo') == -1) {
                            pli.removePriceAdjustment(adj);
                        }
                    });
                });
        });
        basket.getPriceAdjustments().toArray().filter(adj => adj.promotionID.indexOf('OG-Promo') == -1).forEach(adj => {
            basket.removePriceAdjustment(adj);
        });
        if (Site.getCustomPreferenceValue('RemoveNonOGShippingPromos')) {
            basket.getShipments().toArray().forEach(shipment => {
                shipment.getShippingLineItems().toArray().forEach(sli => {
                    sli.getShippingPriceAdjustments().toArray().forEach(adj => {
                        if (!empty(adj.promotionID) && adj.promotionID.indexOf('OG-Promo') > -1) {
                            return;
                        }
                        if (!empty(adj.promotion) && adj.promotion.isBasedOnCoupons() && !empty(adj.couponLineItem)) {
                            let couponLineItem = basket.getCouponLineItem(adj.couponLineItem.couponCode);
                            if (!empty(couponLineItem)) {
                                basket.removeCouponLineItem(couponLineItem);
                            }
                        } else {
                            sli.removeShippingPriceAdjustment(adj);
                        }
                    });
                });
            });
            basket.getShippingPriceAdjustments().toArray().forEach(adj => {
                if (empty(adj.promotionID) || adj.promotionID.indexOf('OG-Promo') == -1) {
                    basket.removeShippingPriceAdjustment(adj);
                }
            });
        };
    }
}

/**
 * standard DW do not work with gift certificates,
 * so use custom coding to handle shipping prices if cart contain plastic gift cards
 * @function calculateGiftCardShipping
 * @module Calculate
 * @param {Basket} basket
 */
function calculateGiftCardShipping(basket) {
    if (!basket.giftCertificateLineItems.isEmpty()) {
        /**
         * search for gift cards in all shipments
         */
        let gcliShipments = basket.shipments.toArray().filter(shipment => !empty(shipment.shippingMethod) && !shipment.giftCertificateLineItems.isEmpty());
        gcliShipments.forEach(shipment => {
            let gcsurchargeTotal = dw.value.Money.NOT_AVAILABLE;
            shipment.giftCertificateLineItems.toArray().some(gcli => {
                if ('isVirtual' in gcli.custom && !empty(gcli.custom.isVirtual) && !gcli.custom.isVirtual) {
                    let product = ProductMgr.getProduct(gcli.giftCertificateID);
                    if (!empty(product)) {
                        let gcpsc = ShippingMgr.getProductShippingModel(product).getShippingCost(shipment.shippingMethod);
                        if (gcpsc != null && gcpsc.getAmount() != null && gcpsc.isSurcharge()) {
                            gcsurchargeTotal = gcpsc.getAmount();
                            return true
                        }
                    }
                }
                return false;
            })
            if (gcsurchargeTotal.available && gcsurchargeTotal.value > 0) {
                shipment.shippingLineItems.toArray().forEach(sli => {
                    var priceValue = shipment.adjustedShippingTotalPrice.value + gcsurchargeTotal.value;
                    sli.setPriceValue(priceValue);
                });
            }
        });
    }
    basket.getShipments().toArray().forEach(shipment => {
        let pgcli = shipment.productLineItems.toArray().filter(e => e.custom.isGiftCard && !e.custom.isVirtual);
        if (ShipmentHelper.hasOnlyGCs(shipment) && !empty(shipment.productLineItems)) {
            let shippingTotal = !empty(pgcli) && pgcli[0].shippingLineItem ? pgcli[0].shippingLineItem.getAdjustedNetPrice() : new dw.value.Money(0, basket.currencyCode);
            shipment.shippingLineItems.toArray().forEach(sli => {
                sli.setPriceValue(shippingTotal.value);
            });
            shipment.productLineItems.toArray().forEach(GC => {
                if (!empty(GC.shippingLineItem)) {
                    GC.shippingLineItem.setPriceValue(0);
                }
            });
        }
        else {
            if (!empty(pgcli) && pgcli.length > 1) {
                pgcli.slice(1).forEach(GC => {
                    if (!empty(GC.shippingLineItem)) {
                        GC.shippingLineItem.setPriceValue(0);
                    }
                });
            }
        }
    });
}

/**
 * @function calculateProductPrices
 *
 * Calculates product prices based on line item quantities. Set calculates prices
 * on the product line items.  This updates the basket and returns nothing
 * @function calculateProductPrices
 * @module Calculate
 * @param {object} basket The basket containing the elements to be computed
 */
function calculateProductPrices(basket) {
    // get total quantities for all products contained in the basket
    var productQuantities = basket.getProductQuantities();
    var productQuantitiesIt = productQuantities.keySet().iterator();

    // get product prices for the accumulated product quantities
    var productPrices = new HashMap();

    while (productQuantitiesIt.hasNext()) {
        var prod = productQuantitiesIt.next();
        var quantity = productQuantities.get(prod);
        productPrices.put(prod, prod.priceModel.getPrice(quantity));
    }

    // iterate all product line items of the basket and set prices
    let productLineItems = basket.getAllProductLineItems().iterator();
    while (productLineItems.hasNext()) {
        var productLineItem = productLineItems.next();
        if (!empty(productLineItem.product)) {
            productLineItem.custom.isGiftCard = productLineItem.product.custom.isGiftCard;
            productLineItem.custom.isVirtual = productLineItem.custom.isGiftCard && productLineItem.product.custom.isVirtual;
            if (productLineItem.product.custom.isGiftCard) {
                productLineItem.setPriceValue(productLineItem.custom.giftCardAmount);
                continue;
            }
        }
        // handle non-catalog products
        if (!productLineItem.catalogProduct) {
            productLineItem.setPriceValue(productLineItem.basePrice.valueOrNull);
            continue;
        }

        var product = productLineItem.product;

        // handle option line items
        if (productLineItem.optionProductLineItem) {
            // for bonus option line items, we do not update the price
            // the price is set to 0.0 by the promotion engine
            if (!productLineItem.bonusProductLineItem) {
                productLineItem.updateOptionPrice();
            }
            // handle bundle line items, but only if they're not a bonus
        } else if (productLineItem.bundledProductLineItem) {
            // no price is set for bundled product line items
            // handle bonus line items
            // the promotion engine set the price of a bonus product to 0.0
            // we update this price here to the actual product price just to
            // provide the total customer savings in the storefront
            // we have to update the product price as well as the bonus adjustment
        } else if (productLineItem.bonusProductLineItem && product !== null) {
            var price = product.priceModel.price;
            var adjustedPrice = productLineItem.adjustedPrice;
            productLineItem.setPriceValue(price.valueOrNull);
            // get the product quantity
            var quantity2 = productLineItem.quantity;
            // we assume that a bonus line item has only one price adjustment
            var adjustments = productLineItem.priceAdjustments;
            if (!adjustments.isEmpty()) {
                var adjustment = adjustments.iterator().next();
                var adjustmentPrice = price.multiply(quantity2.value).multiply(-1.0).add(adjustedPrice);
                adjustment.setPriceValue(adjustmentPrice.valueOrNull);
            }


            // set the product price. Updates the 'basePrice' of the product line item,
            // and either the 'netPrice' or the 'grossPrice' based on the current taxation
            // policy

            // handle product line items unrelated to product
        } else if (product === null) {
            productLineItem.setPriceValue(null);
            // handle normal product line items
        } else {
            productLineItem.setPriceValue(productPrices.get(product).valueOrNull);
        }
    }


}

/**
 * Function sets either the net or gross price attribute of all gift certificate
 * line items of the basket by using the gift certificate base price. It updates the basket in place.
 * @function calculateGiftCertificatePrices
 * @module Calculate
 * @param {object} basket The basket containing the gift certificates
 */
function calculateGiftCertificatePrices(basket) {
    var giftCertificates = basket.getGiftCertificateLineItems().iterator();
    while (giftCertificates.hasNext()) {
        var giftCertificate = giftCertificates.next();
        giftCertificate.setPriceValue(giftCertificate.basePrice.valueOrNull);
    }
}

/**
 * @function calculateTax <p>
 *
 * Determines tax rates for all line items of the basket. Uses the shipping addresses
 * associated with the basket shipments to determine the appropriate tax jurisdiction.
 * Uses the tax class assigned to products and shipping methods to lookup tax rates. <p>
 *
 * Sets the tax-related fields of the line items. <p>
 *
 * Handles gift certificates, which aren't taxable. <p>
 *
 * Note that the function implements a fallback to the default tax jurisdiction
 * if no other jurisdiction matches the specified shipping location/shipping address.<p>
 *
 * Note that the function implements a fallback to the default tax class if a
 * product or a shipping method does explicitly define a tax class.
 *
 * @param {object} basket The basket containing the elements for which taxes need to be calculated
 */
function calculateTax(basket) {
    var shipments = basket.getShipments().iterator();
    while (shipments.hasNext()) {
        var shipment = shipments.next();
        var EGCOnlyShipment = ShipmentHelper.hasOnlyEGCs(shipment);
        // first we reset all tax fields of all the line items
        // of the shipment
        var shipmentLineItems = shipment.getAllLineItems().iterator();
        while (shipmentLineItems.hasNext()) {
            var _lineItem = shipmentLineItems.next();
            // do not touch tax rate for fix rate items
            if (_lineItem.taxClassID === TaxMgr.customRateTaxClassID) {
                _lineItem.updateTax(_lineItem.taxRate);
            } else {
                _lineItem.updateTax(null);
            }
        }

        // identify the appropriate tax jurisdiction
        var taxJurisdictionID = null;

        // if we have a shipping address, we can determine a tax jurisdiction for it
        if (shipment.shippingAddress !== null) {
            var location = new ShippingLocation(shipment.shippingAddress);
            taxJurisdictionID = TaxMgr.getTaxJurisdictionID(location);
        }

        if (taxJurisdictionID === null) {
            taxJurisdictionID = TaxMgr.defaultTaxJurisdictionID;
        }

        // if we have no tax jurisdiction, we cannot calculate tax
        if (taxJurisdictionID === null) {
            continue;
        }

        // shipping address and tax juridisction are available
        var shipmentLineItems2 = shipment.getAllLineItems().iterator();
        while (shipmentLineItems2.hasNext()) {
            var lineItem = shipmentLineItems2.next();
            var taxClassID = lineItem.taxClassID;
            logHandler.debug({ message: StringUtils.format('1. Line Item {0} with Tax Class {1} and Tax Rate {2}', lineItem.lineItemText, lineItem.taxClassID, lineItem.taxRate) }, 'Hooks', 'Calculate');

            // do not touch line items with fix tax rate
            if (taxClassID === TaxMgr.customRateTaxClassID) {
                continue;
            }

            // line item does not define a valid tax class; let's fall back to default tax class
            if (taxClassID === null) {
                taxClassID = TaxMgr.defaultTaxClassID;
            }

            // if we have no tax class, we cannot calculate tax
            if (taxClassID === null) {
                logHandler.debug({ message: StringUtils.format('Line Item {0} has invalid Tax Class {1}', lineItem.lineItemText, lineItem.taxClassID) }, 'Hooks', 'Calculate');
                continue;
            }

            // get the tax rate
            var taxRate = TaxMgr.getTaxRate(taxClassID, taxJurisdictionID);
            if (taxRate === null && taxClassID !== TaxMgr.defaultTaxClassID) {
                if ('productID' in lineItem) {
                    logHandler.error({ message: StringUtils.format('Line Item {0} with sku {1} has missing tax rate for tax class {2}', lineItem.lineItemText, lineItem.productID, taxClassID) }, 'Hooks', 'Calculate');
                }
                taxRate = TaxMgr.getTaxRate(TaxMgr.defaultTaxClassID, taxJurisdictionID);
            }
            // w/o a valid tax rate, we cannot calculate tax for the line item
            if (taxRate === null) {
                continue;
            }

            // calculate the tax of the line item
            if ('isGiftCard' in lineItem.custom && !empty(lineItem.custom.isGiftCard) && lineItem.custom.isGiftCard) {
                lineItem.updateTax(0);
            }
            else if (lineItem instanceof dw.order.ShippingLineItem && EGCOnlyShipment) {
                lineItem.updateTax(0);
            }
            else {
                lineItem.updateTax(taxRate);
            }
            logHandler.debug({ message: StringUtils.format('2. Line Item {0} with Tax Class {1} and Tax Rate {2}', lineItem.lineItemText, lineItem.taxClassID, lineItem.taxRate) }, 'Hooks', 'Calculate');
        }
    }

    // besides shipment line items, we need to calculate tax for possible order-level price adjustments
    // this includes order-level shipping price adjustments
    if (!basket.getPriceAdjustments().empty || !basket.getShippingPriceAdjustments().empty) {
        // calculate a mix tax rate from
        var basketPriceAdjustmentsTaxRate = (basket.getMerchandizeTotalGrossPrice().value / basket.getMerchandizeTotalNetPrice().value) - 1;

        var basketPriceAdjustments = basket.getPriceAdjustments().iterator();
        while (basketPriceAdjustments.hasNext()) {
            var basketPriceAdjustment = basketPriceAdjustments.next();
            basketPriceAdjustment.updateTax(basketPriceAdjustmentsTaxRate);
        }

        var basketShippingPriceAdjustments = basket.getShippingPriceAdjustments().iterator();
        while (basketShippingPriceAdjustments.hasNext()) {
            var basketShippingPriceAdjustment = basketShippingPriceAdjustments.next();
            basketShippingPriceAdjustment.updateTax(basketPriceAdjustmentsTaxRate);
        }
    }

    if (dw.system.Site.getCurrent().getCustomPreferenceValue('ReduceTaxCalls')) {
        basket.custom.PrevTaxCallStatus = 'sfcc';
    }
}

/**
 * Calculates pi amounts
 * @function calculateProductPrices
 * @module Calculate
 * @param {object} basket The basket containing the elements to be computed
 */
function calculatePIAmount(basket) {
    let paymentInstruments = basket.getPaymentInstruments().toArray();
    let gcPaymentInstruments = paymentInstruments.filter(e => e.getPaymentMethod() == 'GIFT_CERTIFICATE');
    let basketTotal = basket.totalGrossPrice;
    gcPaymentInstruments.forEach(pi => {
        // if applicable amount is greater than the pi max, set transaction.amount
        // to the GC max amount
        if (!empty(pi.paymentTransaction)) {
            pi.paymentTransaction.amount = basketTotal > pi.custom.gcMaxApplicable ? new Money(pi.custom.gcMaxApplicable, basket.currencyCode) : basketTotal;
        }
        basketTotal = basketTotal.subtract(pi.paymentTransaction.amount)
    });
    let nonGcPayment = paymentInstruments.find(e => e.getPaymentMethod() != 'GIFT_CERTIFICATE');
    if (!empty(nonGcPayment) && !empty(nonGcPayment.paymentTransaction)) {
        nonGcPayment.paymentTransaction.amount = basketTotal;
    }
}
