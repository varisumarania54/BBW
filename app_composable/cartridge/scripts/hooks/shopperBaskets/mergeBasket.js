/**
 * A namespace.
 * @namespace MergeBasket
 */
'use strict';
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;
const BopisHelper = require('app_composable/cartridge/scripts/helpers/objects/BasketComponents/BopisHelper.js');
const OGHelper = require("int_ordergroove/cartridge/scripts/composable/promotionHelper.js");
const Site = require('dw/system/Site').getCurrent();
const basketHelper = require("app_composable/cartridge/scripts/helpers/objects/basket.js");
const ShippingMgr = require('dw/order/ShippingMgr');
const StoreMgr = require('dw/catalog/StoreMgr');
const UUIDUtils = require('dw/util/UUIDUtils');
/**
 * Returns banner if basket was merged
 * @function afterMerge
 * @memberof mergeBasket
 * @param {dw.order.Basket} basket - Basket after merge
 * @return {Object} objects that contains a type error and text holding the reason message
 */
exports.afterMerge = function (basket) {
    try {
        if (!empty(basket.couponLineItems.toArray())) {
            const removeBasketCouponsIfOverLimit = require('app_composable/cartridge/scripts/helpers/shopperBaskets/couponHelper.js').removeBasketCouponsIfOverLimit;
            removeBasketCouponsIfOverLimit(basket);
        }
        basket.custom.merged = true;
        basketHelper.handleAddingDissmisableMessages(basket, 'Merge')
        //Fix Shipments
        BopisHelper.handlePreferredStore('mergeBasket', basket.custom.preferredStore);
        fixShipments(basket);
        OGHelper.removeOGPropertyOnMerge(basket);
        OGHelper.mergeOGLineItems(basket);
        basket.custom.cartStateString = '';
    }
    catch (e) {
        logHandler.logger.error(e, 'Hooks', 'basketMerge');
    }
}


/**
 * Fixes the shipments in the basket by assigning the appropriate shipping method and store details
 * to each product line item. Removes gift card items from the basket.
 * @function fixShipments
 * @memberof mergeBasket
 * @param {dw.order.Basket} basket - The basket object containing the product line items.
 * @returns {void}
 */

function fixShipments(basket) {
    const ispuShipMethod = ShippingMgr.getAllShippingMethods().toArray().find(method => method.custom.storePickupEnabled);
    const store = !empty(basket.custom.preferredStore) ? StoreMgr.getStore(basket.custom.preferredStore) : null;
    basket.getAllProductLineItems().toArray().forEach(pli => {
        if ("isGiftCard" in pli.custom && pli.custom.isGiftCard && pli.quantity > 1) {
            basket.removeProductLineItem(pli);
        }
        else {
            buildOrGetShipment(basket, pli, ispuShipMethod, store);
        }
    });
}



/**
 * Builds or retrieves a shipment for a given product line item in a basket.
 * @function buildOrGetShipment
 * @memberof mergeBasket
 * @param {dw.order.Basket} basket - The basket object containing the product line items.
 * @param {dw.order.ProductLineItem} productLineItem - The product line item for which the shipment is being built or retrieved.
 * @param {dw.order.ShippingMethod} ispuShipMethod - The shipping method for in-store pickup.
 * @param {dw.catalog.Store} store - The store object containing store details.
 * @returns {void}
 */
function buildOrGetShipment(basket, productLineItem, ispuShipMethod, store) {
    let shipment = basketHelper.getShipment(basket, productLineItem.custom.fromStoreId);
    if (empty(shipment)) {
        let defaultShipment = basket.getDefaultShipment();
        let newShipment = defaultShipment.getProductLineItems().empty && defaultShipment.getGiftCertificateLineItems().empty ? defaultShipment : basket.createShipment(UUIDUtils.createUUID());
        if (!empty(productLineItem.custom.fromStoreId)) {
            let shippingAddress = newShipment.shippingAddress;
            if (shippingAddress === null) {
                shippingAddress = newShipment.createShippingAddress();
            }
            shippingAddress.setFirstName(store.name);
            shippingAddress.setLastName(' ');
            shippingAddress.setAddress1(store.address1);
            shippingAddress.setAddress2(store.address2);
            shippingAddress.setCity(store.city);
            shippingAddress.setPostalCode(store.postalCode);
            shippingAddress.setStateCode(store.stateCode);
            shippingAddress.setCountryCode(store.countryCode.value);
            shippingAddress.setPhone(store.phone);
            newShipment.custom.fromStoreId = productLineItem.custom.fromStoreId;
            newShipment.custom.shipmentType = 'instore';
            newShipment.setShippingMethod(ispuShipMethod);
        }
        else {
            newShipment.setShippingMethod(ShippingMgr.getDefaultShippingMethod());
            newShipment.createShippingAddress();
            let shippingCountryCode = Site.getCustomPreferenceValue('RadialShippingFromCountry');
            if (shippingCountryCode) {
                newShipment.shippingAddress.setCountryCode(shippingCountryCode);
            }
            newShipment.custom.fromStoreId = '';
            newShipment.custom.shipmentType = '';
        }
        productLineItem.setShipment(newShipment);
    }
    else {
        if (!empty(productLineItem.custom.fromStoreId)) {
            shipment.setShippingMethod(ispuShipMethod);
            shipment.custom.fromStoreId = productLineItem.custom.fromStoreId;
            shipment.custom.shipmentType = 'instore';
        }
        else {
            shipment.setShippingMethod(ShippingMgr.getDefaultShippingMethod());
            shipment.custom.fromStoreId = '';
            shipment.custom.shipmentType = '';
        }
        productLineItem.setShipment(shipment);
    }
}
