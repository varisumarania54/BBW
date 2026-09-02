'use strict';

const Site = require('dw/system/Site');
const ShippingMgr = require('dw/order/ShippingMgr');
const ProductMgr = require('dw/catalog/ProductMgr');
const estimatedShipping = require('app_composable/cartridge/scripts/helpers/util/estimatedShipping.js');
const ShipmentHelper = require('app_composable/cartridge/scripts/helpers/objects/shipment.js');
/**
 * Filters the Sfcc supplied shipping methods based on bbw custom rules around CBD, Hazmat, State/ PO box restrictions
 * shipment {dw.order.shipment} the shipment we are looking to get methods for
 * shippingMethodResult {shippingMethodResult} the response object
 */
function filterShippingMethods(shipment, shippingMethodResult) {
    const ispuShipMethod = dw.order.ShippingMgr.getAllShippingMethods().toArray().find(e => e.online && e.custom.storePickupEnabled);
    if (!empty(shipment.custom.fromStoreId) && shipment.custom.shipmentType === 'instore' && !empty(ispuShipMethod)) {
        shippingMethodResult.applicableShippingMethods = shippingMethodResult.applicableShippingMethods.toArray().filter(e => e.ID === ispuShipMethod.ID);
    }
    else {
        if (!empty(ispuShipMethod)) {
            shippingMethodResult.applicableShippingMethods = shippingMethodResult.applicableShippingMethods.toArray().filter(e => e.ID !== ispuShipMethod.ID)
        }
        if (!empty(shipment.getShippingAddress())) {
            if(Site.getCurrent().getCustomPreferenceValue('EnableShippingPOBox')){
                filterForPOBoxAndTerritories(shipment, shippingMethodResult);
            }
            if (empty(shippingMethodResult.applicableShippingMethods)) {
                return;
            }
            filterForUnitRestrictions(shipment, shippingMethodResult);
            filterForHazmatItems(shipment, shippingMethodResult);
            filterForNonHazmatRestrictedItems(shipment, shippingMethodResult);
        }
        else {
            const addressObj = {
                countryCode: "US",
                stateCode: "NY"
            }
            let shippingMethods = dw.order.ShippingMgr.getShipmentShippingModel(shipment).getApplicableShippingMethods(addressObj).toArray().map(e => e.ID);
            shippingMethodResult.applicableShippingMethods = shippingMethodResult.applicableShippingMethods.toArray().filter(e => shippingMethods.indexOf(e.ID) != -1);
        }
    }
}

/**
 * Filters the Sfcc supplied shipping methods based on bbw custom rules territories / PO box restrictions
 * shipment {dw.order.shipment} the shipment we are looking to get methods for
 * shippingMethodResult {shippingMethodResult} the response object
 */
function filterForPOBoxAndTerritories(shipment, shippingMethodResult) {
    const ShippingPOBoxRegex = new RegExp(Site.getCurrent().getPreferences().custom.ShippingPOBoxRegex);
    const DuplicateShippingMethodID = Site.getCurrent().getPreferences().custom.DuplicateShippingMethodID;
    const address = shipment.getShippingAddress();
    if (!empty(ShippingPOBoxRegex) && !empty(DuplicateShippingMethodID)) {
        const stdProductsOnly = shipment.productLineItems.toArray().some(e => empty(e.product.custom.hazmatCode));
        const priorityTerritoriesRegex = new RegExp(Site.getCurrent().getCustomPreferenceValue('priorityTerritoriesRegex'));
        const hasHazmatProduct = shipment.productLineItems.toArray().some(e => !empty(e.product.custom.hazmatCode));
        if (stdProductsOnly && priorityTerritoriesRegex.test(address.stateCode) && (!(ShippingPOBoxRegex.test(address.address1) || ShippingPOBoxRegex.test(address.address2)))) {
            shippingMethodResult.applicableShippingMethods = shippingMethodResult.applicableShippingMethods.toArray().filter(e => e.ID !== DuplicateShippingMethodID);
        }

        if (hasHazmatProduct && (ShippingPOBoxRegex.test(address.address1) || ShippingPOBoxRegex.test(address.address2))) {
            shippingMethodResult.applicableShippingMethods = [];
        }
    }
}

/**
 * Filters the Sfcc supplied shipping methods based on bbw custom unit restriction rules
 * shipment {dw.order.shipment} the shipment we are looking to get methods for
 * shippingMethodResult {shippingMethodResult} the response object
 */
function filterForUnitRestrictions(shipment, shippingMethodResult) {
    const totalUnits = shipment.productLineItems.toArray().reduce((a, b) => a + b.quantityValue, 0);
    shippingMethodResult.applicableShippingMethods = shippingMethodResult.applicableShippingMethods.toArray().filter(e => !('c_SHIPPING_UNIT_EXCLUSION' in e) || empty(e.c_SHIPPING_UNIT_EXCLUSION) || e.c_SHIPPING_UNIT_EXCLUSION <= 0 || totalUnits <= e.c_SHIPPING_UNIT_EXCLUSION)
}

/**
 * Filters the Sfcc supplied shipping methods based on bbw custom rules around hazmat
 * shipment {dw.order.shipment} the shipment we are looking to get methods for
 * shippingMethodResult {shippingMethodResult} the response object
 */
function filterForHazmatItems(shipment, shippingMethodResult) {
    const allHazMat = shipment.productLineItems.toArray().every(e => 'hazmatCode' in e.product.custom && !empty(e.product.custom.hazmatCode));
    if (!empty(shipment.productLineItems) && allHazMat) {
        shippingMethodResult.applicableShippingMethods = shippingMethodResult.applicableShippingMethods.toArray().filter(e => 'c_defaultHazmatShippingMethod' in e && e.c_defaultHazmatShippingMethod)
    }
}

/**
 * Filters the Sfcc supplied shipping methods based on bbw custom rules CBD restrictions and Canada restrictions
 * shipment {dw.order.shipment} the shipment we are looking to get methods for
 * shippingMethodResult {shippingMethodResult} the response object
 */
function filterForNonHazmatRestrictedItems(shipment, shippingMethodResult) {
    if (!empty(ShipmentHelper.getNonHazmatRestrictedItems(shipment))) {
        shippingMethodResult.applicableShippingMethods = [];
    }
}

/**
 * Appends the estimated delivery to the applicable shipping method response.
 * @function addEstimatedDeliveryToMethods
 * @memberof getShippingMethodsForShipment
 * @param {ShippingMethodResult} shippingMethodResult
 */
function addEstimatedDeliveryToMethods(shippingMethodResult) {
    shippingMethodResult.applicableShippingMethods.toArray().forEach(method => {
        let data = estimatedShipping.calculateDeliveryDates(null, method.id);
        if (data.success) {
            method.c_displayEstimatedDelivery = !empty(data.calendarEndTimeBothDates) ? data.calendarEndTimeBothDates : data.calendarEndTimeFormated;
        }
    });
}

/**
 * Adds a property indicating whether there are inapplicable shipping methods to each of the applicable shipping methods.
 * This is determined based on site preferences and the shipment's inapplicable shipping methods.
 *
 * @param {dw.order.Shipment} shipment - The shipment object for which the shipping methods are being processed.
 * @param {Object} shippingMethodResult - An object containing the applicable shipping methods for a given shipment.
 * @return {void} - This function does not return a value. It updates the `c_hasInapplicableShippingMethods` property on each applicable shipping method.
 */
function addHasInapplicableToMethods(shipment, shippingMethodResult) {
    if (Site.getCurrent().getCustomPreferenceValue('addInapplicableShippingMethods')) {
        let hasInapplicableShippingMethods = false;
        let inapplicableMethodsArray = ShippingMgr.getShipmentShippingModel(shipment).getInapplicableShippingMethods().toArray();
        if (inapplicableMethodsArray && inapplicableMethodsArray.length > 0) {
            hasInapplicableShippingMethods = true;
        }
        shippingMethodResult.applicableShippingMethods.toArray().forEach(method => {
            method.c_hasInapplicableShippingMethods = hasInapplicableShippingMethods;
        });
    }
}

/**
 * getShippingMethodsCostForPGCOnly to the pricing for PGC cart
 * @function getShippingMethodsCostForPGCOnly
 * @memberof getShippingMethodsForShipment
 * @param {Shipment} shipment
 * @param {ShippingMethodResult} shippingMethodResult
 */
function getShippingMethodsCostForPGCOnly(shipment, shippingMethodResult) {
    // if cart only contains gift cards then calculate the shipping prices, as ootb is not considering the GCLI only scenario
    if (ShipmentHelper.hasOnlyGCs(shipment)) {
        let pgcli = shipment.giftCertificateLineItems.toArray().find(pli => !pli.custom.isVirtual);
        pgcli = empty(pgcli) ? shipment.productLineItems.toArray().find(e => e.custom.isGiftCard && !e.custom.isVirtual) : null;
        // if atleast one PGC in cart then calculate the price for shipment
        if (pgcli) {
            let pgcProduct = pgcli instanceof dw.order.GiftCertificateLineItem ? ProductMgr.getProduct(pgcli.giftCertificateID) : pgcli.product;
            let allMethods = ShippingMgr.allShippingMethods;
            let shippingMethods = allMethods.toArray().map(e => e.ID);
            let shipM, shippingCost;
            shippingMethodResult.applicableShippingMethods.toArray().forEach((aShipMethod) => {
                shipM = allMethods[shippingMethods.indexOf(aShipMethod.id)]
                shippingCost = ShippingMgr.getProductShippingModel(pgcProduct).getShippingCost(shipM);
                if (shippingCost && shippingCost.amount && shippingCost.amount.available) {
                    aShipMethod.price = shippingCost.amount.decimalValue;
                }
            })
        }
        else {
            let defaultShipMethod = shippingMethodResult.applicableShippingMethods.toArray().find(e => e.id === ShippingMgr.getDefaultShippingMethod().ID);
            if (defaultShipMethod) {
                defaultShipMethod.price = shipment.adjustedShippingTotalPrice.value;
                shippingMethodResult.applicableShippingMethods = [defaultShipMethod];
            }
        }
    }
    else {
        let pgcli = shipment.productLineItems.toArray().filter(e => e.custom.isGiftCard && !e.custom.isVirtual);
        if (!empty(pgcli) && pgcli.length > 1) {
            let allMethods = ShippingMgr.allShippingMethods;
            let shippingMethods = allMethods.toArray().map(e => e.ID);
            var shipM, shippingCost;
            shippingMethodResult.applicableShippingMethods.toArray().forEach((aShipMethod) => {
                shipM = allMethods[shippingMethods.indexOf(aShipMethod.id)]
                shippingCost = ShippingMgr.getProductShippingModel(pgcli[0].product).getShippingCost(shipM);
                if (shippingCost && shippingCost.amount && shippingCost.amount.available) {
                    aShipMethod.price = aShipMethod.price - (shippingCost.amount.decimalValue * (pgcli.length - 1));
                }
            })
        }
    }
}

/**
 * Retrieves a list of inapplicable shipping methods for a given shipment, excluding specific ones and attaching relevant metadata.
 *
 * @param {dw.order.Shipment} shipment - The shipment object for which the inapplicable shipping methods are determined.
 * @return {Array<Object>} An array of objects representing inapplicable shipping methods, containing details such as id, name, description, price,
 *                         estimated delivery details, and custom fields.
 */
function inapplicableMethods(shipment) {

    let inapplicableMethodsArray = ShippingMgr.getShipmentShippingModel(shipment).getInapplicableShippingMethods().toArray();
    let emailShipment = Site.getCurrent().getCustomPreferenceValue('bbwEGCShippingMethodID');
    let shipmentShippingModel = ShippingMgr.getShipmentShippingModel(shipment);

    let inapplicableMethods = inapplicableMethodsArray
        .filter(e => e.ID !== emailShipment)
        .map(function (shippingMethod) {
            let customFields = {}
            for (let key in shippingMethod.custom) {
                if (Object.prototype.hasOwnProperty.call(shippingMethod.custom, key)) {
                    customFields['c_' + key] = shippingMethod.custom[key]
                }
            }

            let estimatedData = estimatedShipping.calculateDeliveryDates(null, shippingMethod.ID);
            let shippingCost = shipmentShippingModel.getShippingCost(shippingMethod);

            let methodDetails = {
                'description': shippingMethod.description || '',
                'id': shippingMethod.ID,
                'name': shippingMethod.displayName,
                'price': 0,
                'c_displayEstimatedDelivery': !empty(estimatedData.calendarEndTimeBothDates) ? estimatedData.calendarEndTimeBothDates : estimatedData.calendarEndTimeFormated
            };
            if (shippingCost && shippingCost.amount && shippingCost.amount.available) {
                methodDetails.price = shippingCost.amount.valueOrNull;
            }

            return Object.assign(methodDetails, customFields)
        });

    return inapplicableMethods;
}

module.exports = {
    filterShippingMethods,
    addEstimatedDeliveryToMethods,
    getShippingMethodsCostForPGCOnly,
    addHasInapplicableToMethods,
    inapplicableMethods
}
