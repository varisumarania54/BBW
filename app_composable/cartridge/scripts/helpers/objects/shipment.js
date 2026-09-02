'use strict';

const Site = require('dw/system/Site').getCurrent();

/**
 * Returns the items that violate the BBW CBD and canada shipping rules
 *
 * @param {dw.order.Shipment} shipment - The shipment object containing product line items and shipping address details.
 * @return {Array} An array of UUIDs representing the non-hazardous restricted items in the shipment.
 */
function getNonHazmatRestrictedItems(shipment) {
    const address = shipment.getShippingAddress();
    let nonHazmatRestrictedItems = [];
    if (!empty(address)) {
        const shippingState = !empty(address.stateCode) ? address.stateCode.toUpperCase() : '';
        const countryCode = !empty(address.countryCode) ? address.countryCode.value.toUpperCase() : '';
        nonHazmatRestrictedItems = !empty(shippingState) ? shipment.productLineItems.toArray().filter(e => e.product && 'shippingRestrictions' in e.product.custom && !empty(e.product.custom.shippingRestrictions) && !empty(e.product.custom.shippingRestrictions) && e.product.custom.shippingRestrictions.indexOf(shippingState) != -1) : [];
        nonHazmatRestrictedItems = nonHazmatRestrictedItems.reduce((a, b) => { a.push(b.UUID); return a }, []);
        if (countryCode == 'CA') {
            //Support GCLI
            nonHazmatRestrictedItems = nonHazmatRestrictedItems.concat(shipment.giftCertificateLineItems.toArray().filter(e => 'isVirtual' in e.custom && !e.custom.isVirtual).reduce((a, b) => { a.push(b.UUID); return a }, []));
            //Support PLI
            nonHazmatRestrictedItems = nonHazmatRestrictedItems.concat(shipment.productLineItems.toArray().filter(e => 'isGiftCard' in e.product.custom && e.product.custom.isGiftCard && 'isVirtual' in e.product.custom && !e.product.custom.isVirtual).reduce((a, b) => { a.push(b.UUID); return a }, []));
            //SupportOG
            nonHazmatRestrictedItems = nonHazmatRestrictedItems.concat(shipment.productLineItems.toArray().filter(e => 'isAutoRefreshSubscribedItem' in e.custom && e.custom.isAutoRefreshSubscribedItem).reduce((a, b) => { a.push(b.UUID); return a }, []));
        }
        if (Site.preferences.custom.EnableCBDRestriction) {
            const ShippingPOBoxRegex = new RegExp(Site.getPreferences().custom.ShippingPOBoxRegex);
            let CBDRestriction = Site.getCustomPreferenceValue('CBDRestriction');
            if (CBDRestriction) {
                CBDRestriction = JSON.parse(CBDRestriction);
            }
            const isPOBox = ShippingPOBoxRegex.test(address.address1) || ShippingPOBoxRegex.test(address.address2);

            if (isPOBox || countryCode == 'CA' || (countryCode == 'US' && CBDRestriction && CBDRestriction.states.indexOf(shippingState) > -1)) {
                nonHazmatRestrictedItems.concat(shipment.productLineItems.toArray().filter(e => 'CBD' in e.product.custom && e.product.custom.CBD).reduce((a, b) => { a.push(b.UUID); return a }, []));
            }
        }
    }
    return nonHazmatRestrictedItems;
}

/**
 * Returns the items that are hazmat restricted
 * @param shipment {dw.order.shipment} the shipment we are inspecting for problem items
 * @return {[string]} The array of UUID's of products that fall in this restriction
 */
function getHazmatRestrictedItems(shipment) {
    return shipment.productLineItems.toArray().filter(e => 'hazmatCode' in e.product.custom && !empty(e.product.custom.hazmatCode)).reduce((a,b) => { a.push(b.UUID); return a },[]);
}

/**
 * Checks if the shiping method on the shipment is valid for the address and items inside it
 * @param {dw.order.shipment} shipment - the shipment object
 * @return {boolean} Returns true if the shipment has no issues otherwise false.
 */
function shipmentMethodValid(shipment) {
    if (!empty(shipment.custom.fromStoreId) && shipment.custom.shipmentType === 'instore') {
        const ispuShipMethod = dw.order.ShippingMgr.getAllShippingMethods().toArray().find(e => e.online && e.custom.storePickupEnabled);
        return empty(ispuShipMethod) ? false : shipment.shippingMethodID === ispuShipMethod.ID
    }

    const restrictedItems = getNonHazmatRestrictedItems(shipment);
    if (!empty(restrictedItems)) {
        return false;
    }

    const hazmatItems = getHazmatRestrictedItems(shipment);
    if (!empty(hazmatItems) && !shipment.shippingMethod.custom.defaultHazmatShippingMethod) {
        return false;
    }

    return true;
}

/**
 * Checks if which shipping method is available and returns a specific error for cart messaging
 * @param {array} applicableShippingMethods - array of valid shipping methods
 * @return {string} Returns cart error message if the shipment has issues otherwise empty string.
 */
function shipmentMethodErrors(applicableShippingMethods) {
    let errorMessage = '';
    if (applicableShippingMethods.some(method => method.ID == 'purolator')) {
        errorMessage = 'Your order can only be shipped by Expedited/Air due to shipping restrictions.';
    }
    return errorMessage;
}

/**
 * Checks if the shipment's shipping address state is within the delivery fee market.
 *
 * @param {dw.order.Shipment} shipment - The shipment object containing details of the shipping address.
 * @return {boolean} - Returns true if the shipment's state is in the delivery fee market, otherwise false.
 */
function isShipmentinDeliveryFeeMarket(shipment) {
    if (!empty(shipment.shippingAddress) && !empty(shipment.shippingAddress.stateCode)) {
        const states = Site.getCustomPreferenceValue('DeliveryFeesMarket');
        const shipmentState = shipment.shippingAddress.stateCode;

        return states.some(e=>e === shipmentState);
    }
}


/**
 * Checks if a shipment only contains virtual gift cards
 * @function hasOnlyEGCs
 * @param {dw.order.Shipment} shipment
 */
function hasOnlyEGCs(shipment){
    return shipment.productLineItems.toArray().every(e=>!empty(e.product.custom.isVirtual) && e.product.custom.isVirtual) && shipment.giftCertificateLineItems.toArray().every(e=>e.custom.isVirtual);
}

/**
 * Checks if a shipment only contains  gift cards
 * @function hasOnlyGCs
 * @param {dw.order.Shipment} shipment
 */
function hasOnlyGCs(shipment){
    return (shipment.giftCertificateLineItems.length > 0 && shipment.productLineItems.length === 0) || shipment.productLineItems.toArray().every(e=>!empty(e.product) && !empty(e.product.custom.isGiftCard) && e.product.custom.isGiftCard);
}

module.exports = {
    getNonHazmatRestrictedItems,
    getHazmatRestrictedItems,
    shipmentMethodValid,
    shipmentMethodErrors,
    isShipmentinDeliveryFeeMarket,
    hasOnlyEGCs,
    hasOnlyGCs
}
