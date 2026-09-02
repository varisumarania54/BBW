/**
 * Bopis Methods
 * @namespace Bopis
 */
'use strict';
const StoreMgr = require('dw/catalog/StoreMgr');
const BopisOrderLimit = require('app_composable/cartridge/scripts/helpers/global/BopisOrderLimits.js');
const ShippingMgr = require('dw/order/ShippingMgr');
const Transaction = require('dw/system/Transaction');
const BasketMgr = require('dw/order/BasketMgr');
const Site = require('dw/system/Site').getCurrent();
const ProductInventoryMgr = require('dw/catalog/ProductInventoryMgr');
const ProductHelper = require('app_composable/cartridge/scripts/helpers/objects/product.js');
const CacheMgr = require('dw/system/CacheMgr');
const ProfileHelper = require('app_composable/cartridge/scripts/helpers/objects/customer.js');
const StoreHelper = require('app_composable/cartridge/scripts/helpers/store/storeHelpers.js');
const sitePrefHelper = require('app_composable/cartridge/scripts/helpers/util/sitePrefHelper');
/**
 * Determines if the shipment contains bag fee product items.
 * @function shipmentHasBagFee
 * @memberof Bopis
 * @param {shipment} shipment - passed in shipment object
 * @return {bool} returns true if the shipment contains bag fees
 */

function shipmentHasBagFee(shipment) {
    const skus = getBagFeeSKUs();
    return shipment.getProductLineItems().toArray().some(e => skus.indexOf(e.productID) != -1);
}

/**
 * Determines if the basket has bopis on it and if so validates that that store is still taking orders
 * @function validateBopisAvailability
 * @memberof Bopis
 * @param {Basket} basket - current user's basket
 * @return {bool} returns true if the basket contains shipments that are unavailable for bopis due to order limits otherwise valse
 */
function validateBopisAvailability(basket) {
    let bopisStoreUnavailable = false;
    if (!empty(basket) && !empty(basket.shipments)) {
        let bopisShipment = basket.shipments.toArray().find(e => !empty(e.custom.fromStoreId) && e.custom.shipmentType === 'instore')
        if (!empty(bopisShipment)) {
            const store = StoreMgr.getStore(bopisShipment.custom.fromStoreId);
            if (!empty(store) && !BopisOrderLimit.isBopisStoreAvailable(store)) {
                bopisStoreUnavailable = true;
            }
        }
    }
    return bopisStoreUnavailable;
}

/**
 * returns the shipping method associated with bopis if one exsists
 * @function getStorePickupShipppingMethod
 * @memberof Bopis
 * @returns {ShippingMethod}
 */
function getStorePickupShipppingMethod() {
    const shippingMethods = ShippingMgr.getAllShippingMethods().toArray();
    return shippingMethods.find(e => e.custom.storePickupEnabled);
}

/**
 * Determines if a shipment only contains bag fees
 * @function shipmentHasJustBagFee
 * @memberof Bopis
 * @param {Shipment} shipment
 * @return {Boolean}
 */
function shipmentHasJustBagFee(shipment) {
    return (shipment.getProductLineItems().size() == 1 && shipmentHasBagFee(shipment));
}

/**
 *Copies the shipping order adress to the passed in shipment
 * @function copyShippingAddressToShipment
 * @memberof Bopis
 * @param {OrderAddress} shippingData
 * @param {Shipment} shipment
 */
function copyShippingAddressToShipment(shippingData, shipment) {
    let shippingAddress = shipment.shippingAddress;

    Transaction.wrap(function () {
        if (shippingAddress === null) {
            shippingAddress = shipment.createShippingAddress();
        }

        shippingAddress.setFirstName(shippingData.firstName);
        shippingAddress.setLastName(shippingData.lastName);
        shippingAddress.setAddress1(shippingData.address1);
        shippingAddress.setAddress2(shippingData.address2);
        shippingAddress.setCity(shippingData.city);
        shippingAddress.setPostalCode(shippingData.postalCode);
        shippingAddress.setStateCode(shippingData.stateCode);
        let countryCode = shippingData.countryCode.value ? shippingData.countryCode.value : shippingData.countryCode;
        shippingAddress.setCountryCode(countryCode);
        shippingAddress.setPhone(shippingData.phone);
    });
}

/**
 *Validates the bag fees on the basket
 * @function validateBagFeesInBasket
 * @memberof Bopis
 * @param {Basket} basket - current basket
 * @param {Store} store - store object
 */
function validateBagFeesInBasket(basket, store) {

    if (!isBagFeesEnabled() || empty(basket) || empty(store)) {
        return;
    }


    let pickupShipment = basket.shipments.toArray().find(e => e.custom.fromStoreId === store.ID && !empty(e.custom.shipmentType));

    if (empty(pickupShipment) || pickupShipment.getProductLineItems().size() == 0) {
        return;
    }
    let bagFeePli = getBagFeeInBasket(basket);

    if (empty(store.custom.bagFeeSku) && !empty(bagFeePli)) {
        basket.removeProductLineItem(bagFeePli);
    } else {
        //Add Bag Fee is not in Basket
        if (empty(bagFeePli) && !empty(pickupShipment) && !empty(store.custom.bagFeeSku)) {
            bagFeePli = basket.createProductLineItem(store.custom.bagFeeSku, pickupShipment);
            setStoreInProductLineItem(store.ID, bagFeePli, true);
        } else if (!empty(bagFeePli)) {
            //Bag Fees in Cart needs updated to new Stores Bag Fee
            if (bagFeePli.productID != store.custom.bagFeeSku) {
                basket.removeProductLineItem(bagFeePli);
                bagFeePli = basket.createProductLineItem(store.custom.bagFeeSku, pickupShipment);
                setStoreInProductLineItem(store.ID, bagFeePli, true);
            }
        }
    }

    return;
}

/**
 *Sets the store details needed on the passed in product line item if applicable
 * @function setStoreInProductLineItem
 * @memberof Bopis
 * @param {String} storeId
 * @param {ProductLineItem} productLineItem
 * @param {Boolean} isBagFee
 */
function setStoreInProductLineItem(storeId, productLineItem, isBagFee) {
    Transaction.wrap(function () {
        if (storeId) {
            const store = StoreMgr.getStore(storeId);
            const inventoryList = BopisOrderLimit.getStoreInventoryList(store);
            if (inventoryList && inventoryList.getRecord(productLineItem.productID)
                && inventoryList.getRecord(productLineItem.productID).ATS.value
                >= productLineItem.quantityValue) {
                productLineItem.custom.fromStoreId = store.ID;
                productLineItem.setProductInventoryList(inventoryList);
            } else if (isBagFee) {
                productLineItem.custom.fromStoreId = store.ID;
                productLineItem.setProductInventoryList(inventoryList);
            }
        }
    });
}

/**
 *Returns the bag fee pli if one exsists on basket
 * @function getBagFeeInBasket
 * @memberof Bopis
 * @param {Basket} currentBasket
 * @return {ProductLineItem} or null
 */
function getBagFeeInBasket(currentBasket) {
    const skus = getBagFeeSKUs();
    return currentBasket.getProductLineItems().toArray().find(e => skus.some(j => j === e.productID));
}

/**
 * Handles the updates to the Basket|Profile|Session depending on the context.
 * @function handlePreferredStore
 * @memberof Bopis
 * @param {string} context - ID of the action you are preforming
 * @param {string} storeId - ID of store to handle
 * @return {Boolean} determine weather FE needs to update
 */

function handlePreferredStore(context, storeId) {
    const store = StoreMgr.getStore(storeId);
    if (!empty(store)) {
        switch (context) {
            case 'onSession':
            case 'transferBasket':
            case 'mergeBasket':
            case 'changeStoreModal':
            case 'addToCart':
                return setStoreOnBasket(store) || ProfileHelper.updatePreferredStoreOnProfile(store);
            case 'logout':
                return true;
            default:
                return false;
        }
    }
    return false;
}

/**
 * Sets Store ID on basket, corrects fromStoreID on plis, and corrects address on instore shipments
 * @function setStoreOnBasket
 * @memberof Basket
 * @param {Basket | null} basket - current user's basket
 * @param {*} store -  store object
 */
function setStoreOnBasket(store, basket) {
    if (empty(basket)) {
        basket = BasketMgr.getCurrentBasket()
    }

    if ((!empty(basket) && !empty(store)) &&
        (!('preferredStore' in basket.custom) || 'preferredStore' in basket.custom && !empty(basket.custom.preferredStore) && basket.custom.preferredStore !== store.ID)) {
        const storeInvList = BopisOrderLimit.getStoreInventoryList(store);
        const IspuShipments = basket.getShipments().toArray().filter((shipment) => shipment.custom.shipmentType === 'instore')
        basket.custom.preferredStore = store.ID;
        IspuShipments.forEach((shipment) => {
            let shippingAddress = shipment.getShippingAddress();
            if (empty(shippingAddress)) {
                shippingAddress = shipment.createShippingAddress();
            }
            StoreHelper.setStoreAddress(shippingAddress, store);
            shipment.custom.fromStoreId = store.ID;
            shipment.productLineItems.toArray().forEach(pli => {
                'fromStoreId' in pli.custom && !empty(pli.custom.fromStoreId) ? pli.custom.fromStoreId = store.ID : ''
                pli.custom.storeInventory = ProductHelper.getSFCCAvailability(pli.product, store.ID).storeInv;
                pli.setProductInventoryList(storeInvList);
                pli.setProductInventoryListID(storeInvList.ID);
            })
        })
        return true;
    }
    return false;
}

/**
 *Returns site pref value bagFeeSkus
 * @function getBagFeeSKUs
 * @memberof Bopis
 * @return {Array} or null
 */
function getBagFeeSKUs() {
    return Site.getCustomPreferenceValue('bagFeeSkus');
}

/**
 *Returns site pref value enableStorePickUp
 * @function isBopisEnabled
 * @memberof Bopis
 * @return {Boolean} or null
 */
function isBopisEnabled() {
    return sitePrefHelper.getSitePrefValue('enableStorePickUp');
}

/**
 *Returns site pref value BopisOrderLimits
 * @function isBopisOrderLimitsEnabled
 * @memberof Bopis
 * @return {Boolean} or null
 */
function isBopisOrderLimitsEnabled() {
    return Site.getCustomPreferenceValue('BopisOrderLimits');
}

/**
 *Returns site pref value isBagFeesEnabled
 * @function isBagFeesEnabled
 * @memberof Bopis
 * @return {Boolean} or null
 */
function isBagFeesEnabled() {
    return Site.getCustomPreferenceValue('isBagFeesEnabled');
}

/**
 * Gets the nearby stores based on the passed in store
 * @function getNearbyStores
 * @memberof Bopis
 * @param {String} storeId : The Id of the store to use as the point of refrence
 * @return {Array | null} or null
 */
function getNearbyStores(storeId) {

    

    const currentStore = StoreHelper.getStoreAttributesUsingCache(storeId);
    if (empty(currentStore)) {
        return [];
    }
    return StoreMgr
        .searchStoresByCoordinates(currentStore.latitude, currentStore.longitude, 'mi', parseFloat(Site.getCustomPreferenceValue('bopis_radius')))
        .keySet().toArray().filter(e => BopisOrderLimit.isBopisStoreAvailable(e));
}

/**
 * Handles checking if an item is available in nearby stores
 * @function checkBopisRadiusStores
 * @memberof Bopis
 * @param {Basket} basket : The current users basket
 * @param {BasketsResult} basketResponse : The basketResponse
 */
function checkBopisRadiusStores(basket, basketResponse) {
    if (!empty(basket.custom.preferredStore)) {
        const stores = getNearbyStores(basket.custom.preferredStore);
        const productLineItemContainer = basket.getProductLineItems().toArray();
        basketResponse.productItems.toArray().forEach(productItem => {
            if (empty(stores)) {
                productItem.c_hasInvInNearbyStores = false;
            }
            else {
                let pli = productLineItemContainer.find(pli => pli.productID == productItem.productId && pli.custom.fromStoreId == productItem.c_fromStoreId);
                productItem.c_hasInvInNearbyStores = stores.some(store => {
                    return BopisOrderLimit.getProductStoreAvailabilityUsingCache(pli.product,store);
                })
            }
        })
    }
}

/**
 * Handles checking if a basket has any eligiable bopis items
 * @function isCartBopisEligible
 * @memberof Bopis
 * @param {Basket} basket : The current users basket
 * @return boolean
 */
function isCartBopisEligible(basket) {
    return !empty(basket.productLineItems) && basket.productLineItems.toArray().some(pli=> pli.product && pli.product.custom.availableForInStorePickup)
}



module.exports = {
    validateBopisAvailability,
    getStorePickupShipppingMethod,
    shipmentHasJustBagFee,
    copyShippingAddressToShipment,
    getBagFeeSKUs,
    isBopisEnabled,
    isBopisOrderLimitsEnabled,
    isBagFeesEnabled,
    validateBagFeesInBasket,
    getBagFeeInBasket,
    handlePreferredStore,
    shipmentHasBagFee,
    checkBopisRadiusStores,
    setStoreOnBasket,
    isCartBopisEligible,
    getNearbyStores
}
