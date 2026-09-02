'use strict';

const dataValidation = require('app_composable/cartridge/scripts/helpers/util/dataValidation.js').dataValidation;
const createOrderHelper = require('app_composable/cartridge/scripts/helpers/shopperOrders/createOrderHelper.js');
const couponHelper = require('app_composable/cartridge/scripts/helpers/objects/coupon.js');
const basketCouponHelper = require('app_composable/cartridge/scripts/helpers/shopperBaskets/couponHelper.js');
const NullMoney = dw.value.Money.NOT_AVAILABLE;
const ShippingMgr = require('dw/order/ShippingMgr');
const validationUtil = require('app_composable/cartridge/scripts/helpers/util/validationsUtil.js');
const ShipmentHelper = require('app_composable/cartridge/scripts/helpers/objects/shipment.js');
const Resource = require('dw/web/Resource');
const Site = require('dw/system/Site').getCurrent();
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;
const ExternalInventory = require('app_composable/cartridge/scripts/helpers/integrations/inventory/ExternalInventory.js');

/**
 * Validates a basket for create order
 *
 * @function validateBasketForOrderCreate
 * @memberof Util
 * @param {dw.order.Basket} Basket
 * @param {Object} requestBody - The request body object that includes additional data, such as payment information or flags.
 * @return {string|Error} Returns a specific error message as a string if validation fails, or throws an error for unhandled cases.
 */
function validateBasketForOrderCreate(basket, requestBody) {
    try {
        if (empty(basket.getBillingAddress())) {
            logHandler.logger.warn("Empty billing address", 'Hooks', 'OrderFail');
            throw new Error(buildJsonError("billing", "Missing billing info"));
        }
        const billingResult = isValidOrderAddress(basket.getBillingAddress());
        if (!billingResult.result) {
            logHandler.logger.warn("Billing faild validation : {" + billingResult.field + "} Was invalid for field: {" + billingResult.fieldId + "}", 'Hooks', 'OrderFail');
            throw new Error(buildJsonError("billing", "Missing billing info"));
        }
        if (empty(basket.getCustomerEmail()) || !dataValidation.isValidEmail(basket.getCustomerEmail())) {
            throw new Error(buildJsonError("billing", "Missing Email"));
        }
        if (empty(basket.getPaymentInstruments()) || !createOrderHelper.paymentValid(basket)) {
            throw new Error(buildJsonError("billing", Resource.msg('invalidcreditcard', 'billing', null)));
        }

        if (Site.getCustomPreferenceValue("validatePaymentInstrumentTotalOnOrderPlace") && !createOrderHelper.paymentInstrumentTotalValid(basket)) {
            throw new Error(buildJsonError("billing", Resource.msg('invalidcreditcard', 'billing', null)));
        }

        if (!empty(basket.getCouponLineItems().toArray()) && basketCouponHelper.overCouponLimit(basket)) {
            throw new Error(buildJsonError("cart", "Coupon Limit Exceeded"))
        }

        if (!session.userAuthenticated && (basket.getPaymentInstruments().toArray().some(e => e.getPaymentMethod() == 'GIFT_CERTIFICATE') &&
            (basket.getGiftCertificateLineItems().length > 0 || basket.productLineItems.toArray().some(e => e.product.custom.isGiftCard)))
        ) {
            throw new Error(buildJsonError('cart', 'GiftPaymentWithGiftCertificate'));
        }

        if (basket.getCouponLineItems().toArray().some(cli => {
            return !couponHelper.isValidCouponCode(cli) || !cli.valid;
        })) {
            throw new Error(buildJsonError("cart", "Invalid Coupon"));
        }
        const invalidPLIs = [];
        const plis = basket.getProductLineItems().toArray();
        const productIds = plis.filter(function (pli) { return !empty(pli.product) && pli.product.online; }).map(function (pli) { return pli.productID; });
        const storeID = basket.custom.preferredStore || null;
        const inventoryMap = ExternalInventory.getInventoryForProductNOServiceCall(productIds, storeID);

        plis.forEach(function (pli) {
            var fullfillmentType = !empty(pli.shipment.custom.fromStoreId) ? 'storeInventory' : 'webInventory';
            if (empty(pli.product) || !pli.product.online) {
                invalidPLIs.push({ id: pli.UUID, fullfillmentType: fullfillmentType, fulfillmentType: fullfillmentType, c_lineLevelError: Resource.msg('item.outofstock.online_pickup', 'cart', null) });
                return;
            }
            var isOOS = false;
            const invList = pli.productInventoryList;
            if (!empty(invList)) {
                const record = invList.getRecord(pli.product);
                if (empty(record) || (!record.perpetual && pli.quantityValue > record.ATS.value)) {
                    isOOS = true;
                }
            }
            else {
                const avaModel = pli.product.getAvailabilityModel();
                if (empty(avaModel) || empty(avaModel.inventoryRecord) || (!avaModel.inventoryRecord.perpetual && pli.quantityValue > avaModel.inventoryRecord.ATS)) {
                    isOOS = true;
                }
            }
            if (isOOS) {
                const inv = inventoryMap[pli.productID];
                let pliMsg;
                if (!empty(pli.shipment.custom.fromStoreId)) {
                    // BOPIS item OOS — only suggest "switch to shipping" if product has web availability
                    pliMsg = (inv && inv.webInv > 0)
                        ? Resource.msg('item.outofstock.pickup.nostore', 'cart', null)
                        : Resource.msg('item.outofstock.online_pickup', 'cart', null);
                } else {
                    // STH item OOS — only suggest "switch to pickup" if product has BOPIS availability
                    pliMsg = (inv && inv.bopisInv > 0)
                        ? Resource.msg('item.outofstock.online', 'cart', null)
                        : Resource.msg('item.outofstock.online_pickup', 'cart', null);
                }
                invalidPLIs.push({ id: pli.UUID, fullfillmentType: fullfillmentType, fulfillmentType: fullfillmentType, c_lineLevelError: pliMsg });
                return;
            }

            if (empty(pli.adjustedPrice) || pli.adjustedPrice == NullMoney || pli.adjustedPrice.value < 0) {
                invalidPLIs.push({ id: pli.UUID, fullfillmentType: fullfillmentType, fulfillmentType: fullfillmentType, c_lineLevelError: Resource.msg('item.outofstock.online_pickup', 'cart', null) });
                return;
            }

            if (Site.getCustomPreferenceValue("validateProductPriceAdjustments") && !empty(pli.priceAdjustments) && pli.priceAdjustments.toArray().some(pa => {
                let paValid = priceAdjustmentValid(pa);
                if (!paValid) {
                    logHandler.logger.warn("Product Price adjustment validation : {" + pa.promotionID + "}", 'Hooks', 'OrderFail');
                    throw new Error(buildJsonError("cart", Site.getCustomPreferenceValue("invalidPriceAdjustmentMessage")));
                }
                return !paValid;
            })) {
                return;
            }
        });
        if (invalidPLIs.length > 0) {
            const errorCount = invalidPLIs.length;
            const banner = Resource.msgf('items.unavailableCount', 'cart', null, errorCount, errorCount > 1 ? 'are' : 'is');
            const responseMessage = {
                page: "cart",
                data: {
                    banner: banner,
                    allocationData: {
                        errorItems: invalidPLIs
                    }
                }
            };
            throw new Error(JSON.stringify(responseMessage));
        }

        if (basket.getShipments().toArray().some(shipment => {
            if (ShipmentHelper.hasOnlyEGCs(shipment)) {
                return false;
            }
            if ((empty(shipment.shippingAddress))) {
                logHandler.logger.warn("Empty shipping address", 'Hooks', 'OrderFail');
                return true;
            }
            let shippingResult = isValidOrderAddress(shipment.shippingAddress);
            if (!shippingResult.result) {
                logHandler.logger.warn("Shipment faild validation : {" + shippingResult.field + "} Was invalid for field : {" + shippingResult.fieldId + "}", 'Hooks', 'OrderFail');
                return true;
            }
            const shippingModal = ShippingMgr.getShipmentShippingModel(shipment);
            const applicableShippingMethods = shippingModal.applicableShippingMethods.toArray();
            if(shipment.shippingMethodID != 'ISPU' && !applicableShippingMethods.some(e=>e.ID == shipment.shippingMethodID) && !empty(ShipmentHelper.getHazmatRestrictedItems(shipment))){
                throw new Error(buildJsonError("cart", Resource.msg('hazmatItemInvalidAddress','billing',null)));
            }
            if (empty(shipment.shippingMethod) || empty(shippingModal.applicableShippingMethods) ||
                !applicableShippingMethods.some(method => method.ID === shipment.shippingMethodID)) {
                let errorMessage = ShipmentHelper.shipmentMethodErrors(applicableShippingMethods);
                if (errorMessage) {
                    throw new Error(buildJsonError("cart", errorMessage));
                }
                if (shipment.shippingMethod) {
                    logHandler.logger.warn("Shipping method with ID :" + shipment.shippingMethod.ID + " Was invalid ", 'Hooks', 'OrderFail');
                    logHandler.logger.failOrderAddLogInformation(basket, 'ORDER_PLACEMENT_ERROR');
                }
                else {
                    logHandler.logger.warn("No shipping method for shipment", 'Hooks', 'OrderFail');
                }
                return true;
            }
            if (empty(shipment.adjustedShippingTotalPrice) || shipment.adjustedShippingTotalPrice == NullMoney || shipment.adjustedShippingTotalPrice.value < 0) {
                return true;
            }
            return false;
        })) {
            throw new Error(buildJsonError("cart", Resource.msg('invalidshipment', 'billing', null)));
        }

        if (basket.getProductLineItems().toArray().some(e => e.custom.isAutoRefreshSubscribedItem) &&
            (
                (customer.getProfile().getWallet() &&
                    !customer.getProfile().getWallet().getPaymentInstruments().toArray().some(e => e.custom.DefaultCard) && !requestBody.c_saveToInstruments)
            )
        ) {
            throw new Error(buildJsonError("billing", Resource.msg('defaultcarderror', 'billing', null)));
        }

        if (Site.getCustomPreferenceValue("validateOrderPriceAdjustments") && !empty(basket.priceAdjustments)) {
            let badOrderPA = { promotionID: '' };
            if (basket.priceAdjustments.toArray().some(pa => {
                badOrderPA = pa;
                return !priceAdjustmentValid(pa);
            })) {
                logHandler.logger.warn("Product Price adjustment validation : {" + badOrderPA.promotionID + "}", 'Hooks', 'OrderFail');
                throw new Error(buildJsonError("cart", Site.getCustomPreferenceValue("invalidPriceAdjustmentMessage")));
            }
        }

        if (Site.getCustomPreferenceValue("validateShippingPriceAdjustments") && !empty(basket.allShippingPriceAdjustments)) {
            let badShippingPA = { promotionID: '' };
            if (basket.allShippingPriceAdjustments.toArray().some(pa => {
                badShippingPA = pa;
                return !priceAdjustmentValid(pa);
            })) {
                logHandler.logger.warn("Shipping Price adjustment validation : {" + badShippingPA.promotionID + "}", 'Hooks', 'OrderFail');
                throw new Error(buildJsonError("cart", Site.getCustomPreferenceValue("invalidPriceAdjustmentMessage")));
            }
        }
    }
    catch (e) {
        if (e.message.indexOf("page:")) {
            return e.message;
        }
        throw (e);
    }
}

function buildJsonError(page, banner) {
    const responseMessage =
    {
        page: page,
        data: {
            banner: banner
        }
    }
    return JSON.stringify(responseMessage);
}

/**
 * Returns the message string if it is a valid buildJsonError JSON payload,
 * otherwise returns null.
 * @param {string} message
 * @returns {string|null}
 */
function isValidJsonErrorMessage(message) {
    try {
        const parsed = JSON.parse(message);
        return (parsed && parsed.page && parsed.data && parsed.data.banner) ? message : null;
    } catch (_) {
        return null;
    }
}

function priceAdjustmentValid(pa) {
    return pa.isCustom() || (!empty(pa.promotion) && pa.promotion.active);
}

function isValidOrderAddress(address) {
    // Validate first name
    if (empty(address.firstName) || !validationUtil.validateField('firstName', address.firstName)) {
        return { field: address.firstName ? address.firstName : 'EMPTY', result: false, fieldId: 'firstName' };
    }
    // Validate last name
    if (empty(address.lastName) || !validationUtil.validateField('lastName', address.lastName)) {
        return { field: address.lastName ? address.lastName : 'EMPTY', result: false, fieldId: 'lastName' };
    }
    // Validate address1
    if (empty(address.address1) || !validationUtil.validateField('address1', address.address1)) {
        return { field: address.address1 ? address.address1 : 'EMPTY', result: false, fieldId: 'address1' };
    }
    // Validate address2
    if (!empty(address.address2) && !validationUtil.validateField('address2', address.address2)) {
        return { field: address.address2 ? address.address2 : 'EMPTY', result: false, fieldId: 'address2' };
    }
    // Validate city
    if (empty(address.city) || !validationUtil.validateField('city', address.city)) {
        return { field: address.city ? address.city : 'EMPTY', result: false, fieldId: 'city' };
    }
    if (empty(address.countryCode) || !validationUtil.validateField('countryCode', address.countryCode.value, address.countryCode.value)) {
        return { field: address.firstName ? address.firstName : 'EMPTY', result: false, fieldId: 'countryCode' };
    }
    if (empty(address.stateCode) || !validationUtil.validateField('stateCode', address.stateCode, address.countryCode.value)) {
        return { field: address.stateCode ? address.stateCode : 'EMPTY', result: false, fieldId: 'stateCode' };
    }
    // Validate postal code
    if (empty(address.postalCode) || !validationUtil.validateField('postalCode', address.postalCode, address.countryCode.value)) {
        return { field: address.postalCode ? address.postalCode : 'EMPTY', result: false, fieldId: 'postalCode' };
    }
    // Validate phone number
    // if (empty(address.phone) || !validationUtil.validateField('phone', address.phone)) {
    //     return false;
    // }

    return { field: '', result: true, fieldId: '' };
}


module.exports = {
    validateBasketForOrderCreate,
    buildJsonError,
    isValidJsonErrorMessage
};
