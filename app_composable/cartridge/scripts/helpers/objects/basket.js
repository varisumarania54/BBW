
/**
 * Basket
 * @namespace Basket
 */

'use strict';
const UUIDUtils = require('dw/util/UUIDUtils');
const StoreMgr = require('dw/catalog/StoreMgr');
const Discount = require('dw/campaign/Discount');
const ShippingMgr = require('dw/order/ShippingMgr');
const ProductInventoryMgr = require('dw/catalog/ProductInventoryMgr');
const BopisHelper = require('app_composable/cartridge/scripts/helpers/objects/BasketComponents/BopisHelper.js');
const BopisOrderLimits = require('app_composable/cartridge/scripts/helpers/global/BopisOrderLimits.js');
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js');
const ProductHelper = require('app_composable/cartridge/scripts/helpers/objects/product.js');
const Resource = require('dw/web/Resource');
const Site = require('dw/system/Site').getCurrent();
const InvService = require('app_composable/cartridge/scripts/helpers/integrations/inventory/ExternalInventory.js');
const CouponMgr = require('dw/campaign/CouponMgr');
const shipmentHelper = require('app_composable/cartridge/scripts/helpers/objects/shipment.js');
const StringUtils = require("dw/util/StringUtils");
const sitePrefHelper = require('app_composable/cartridge/scripts/helpers/util/sitePrefHelper');

/**
 * Handle logic toget an exsisting line item on the basket
 * @function getExsistingLineItemInCart
 * @memberof Basket
 * @param {string} productId - id of the product to look for in basket
 * @param {Basket} basket - current user's basket
 * @param {string} storeId - Id of the store the item is asociated with or null for web
 * @param {boolean} isBonusProductLineItem - if filtering for bonus product line item is needed
 * @return {ProductLineItem} - Returns product line item if exsists on the basket Or null
 */
function getExsistingLineItemInCart(productId, basket, storeId, isBonusProductLineItem) {
    const productLineItemContainer = basket.getProductLineItems().toArray();
    return productLineItemContainer.find(pli => pli.productID == productId && pli.custom.fromStoreId == storeId && (empty(isBonusProductLineItem) || pli.bonusProductLineItem == isBonusProductLineItem));
}
/**
 * Gets exsisting shipment based on Bopis/STH.
 * @function getShipment
 * @memberof Basket
 * @param {Basket} basket - current user's basket
 * @param {string|null} [storeId] - Id of the bopis store or null for web
 * @return {Shipment} - Returns shipment if exsists on the basket Or null
 */
function getShipment(basket, storeId) {
    if (!empty(storeId)) {
        return basket.shipments.toArray().find(e => e.custom.fromStoreId === storeId && !empty(e.custom.shipmentType))
    }
    else {
        return basket.shipments.toArray().find(e => empty(e.custom.fromStoreId) && empty(e.custom.shipmentType))
    }
}

/**
 * Returns the number of free items on the basket
 * @function getFreeItemCount
 * @memberof Basket
 * @param {Basket} basket - current user's basket
 * @return {number} - the count of free items on the basket
 */
function getFreeItemCount(basket) {
    let count = 0;
    let lineItems = basket.getProductLineItems().toArray();
    lineItems.forEach(pli => {
        pli.priceAdjustments.toArray().filter(e => 'promotionID' in e && !(e.promotionID.indexOf('OG-Promo') > -1)).forEach(pa => {
            let appliedDiscount = pa.getAppliedDiscount();
            if (appliedDiscount.type == Discount.TYPE_FREE || ((appliedDiscount.type == Discount.TYPE_PERCENTAGE || appliedDiscount.type == Discount.TYPE_FIXED_PRICE)
                && (pli.basePrice.value + (pa.basePrice.value / pa.appliedDiscount.quantity) == 0))) {
                count += appliedDiscount.quantity;
            }
        });

    });
    return count;
}

/**
 * Returns the product line items that will have fake line items based on the price adjustments.
 * @function getLineItemsWithFakeLineItems
 * @memberof Basket
 * @param {Basket} basket - current user's basket
 * @return {Array[pli]} Array of product line items that will have fake line items
 */
function getLineItemsWithFakeLineItems(basket) {
    let items = [];
    basket.getAllProductLineItems().toArray().forEach(pli => {
        if (!empty(pli.priceAdjustments) && !empty(pli.priceAdjustments.toArray().find(pa => pa.quantity > 0 && pa.quantity < pli.getQuantityValue()))) {
            items.push(pli);
        }
    });
    return items;
}

/**
 * Returns the quantity of items that will show up in c_bonusLineItems
 * @function getFakeLineItemQuantity
 * @memberof Basket
 * @param {Basket} basket - current user's basket
 * @return {Number} the qty of items that show up in c_bonusLineItems
 */
function getFakeLineItemQuantity(pli) {
    let totalQty = 0;
    if (pli && !empty(pli.priceAdjustments)) {
        let startQty = pli.quantity;
        pli.priceAdjustments.toArray().forEach(pa => {
            if (pa.quantity < startQty) {
                startQty = startQty - pa.quantity;
                totalQty += pa.quantity
            }
        })
    }
    return totalQty;
}

/**
 *  Switches the fulfillment method of items in the basket based on availability. This does enforce product limits as well as clean up
 * any empty shipments.
 * @function switchFullfilmentBasedOnAvailability
 * @memberof Basket
 * @param {Basket} basket - the current Basket
 * @return {Object}
 */
function switchFullfilmentBasedOnAvailability(basket) {
    let shippingShipment = getShipment(basket, '');
    let storePickupShipment = !empty(basket.custom.preferredStore) ? getShipment(basket, basket.custom.preferredStore) : null;
    const defaultShipMethod = ShippingMgr.getDefaultShippingMethod();
    const defaultBopisShipMethod = BopisHelper.getStorePickupShipppingMethod();
    let itemSwitchedShippment = false;
    let ShippingChangedLineItemArray = [];
    let QuantityErrorLineItemArray = [];
    const preferredStore = basket.custom.preferredStore;
    if (!empty(preferredStore) && BopisOrderLimits.isBopisStoreAvailable(preferredStore)) {
        const Store = StoreMgr.getStore(preferredStore);
        const storeInvList =  BopisOrderLimits.getStoreInventoryList(Store)
        const storeInvListId = !empty(storeInvList) ? storeInvList.ID : null;
        const sthInventoryListId = ProductInventoryMgr.getInventoryList();
        const bagFees = BopisHelper.getBagFeeSKUs();
        //Inventory Allocation Logic.....
        basket.getAllProductLineItems().toArray().filter(e => !bagFees.some(f => f === e.productID)).forEach(pli => {
            // replaces availability obj
            let inventoryObj = ProductHelper.getSFCCAvailability(pli.product, preferredStore)
            //temperally setting custom inventory properties on pli object
            pli.custom.webInventory = inventoryObj.webInv;
            pli.custom.storeInventory = inventoryObj.storeInv;
            //if pli is bopis
            let invPropValue = !empty(pli.custom.fromStoreId) ? 'storeInventory' : 'webInventory';
            let switchingToSTH = invPropValue === 'storeInventory';
            let altPropValue = switchingToSTH ? 'webInventory' : 'storeInventory';
            let altInvList = switchingToSTH ? ProductInventoryMgr.getInventoryList(sthInventoryListId) : ProductInventoryMgr.getInventoryList(storeInvListId);
            let altShipment = switchingToSTH ? shippingShipment : storePickupShipment;
            if (pli.custom[invPropValue] <= pli.quantityValue) {
                if (pli.custom[invPropValue] <= 0 && pli.quantityValue <= pli.custom[altPropValue]) {
                    let shippingMethod = switchingToSTH ? defaultShipMethod : defaultBopisShipMethod;
                    let shipmentType = switchingToSTH ? "web" : "instore";
                    let altPreferredStore = switchingToSTH ? null : preferredStore;
                    pli.custom.fromStoreId = altPreferredStore;
                    pli.setProductInventoryList(altInvList);
                    switchShipment(basket, pli, altShipment, shippingMethod, altPropValue, shipmentType, altPreferredStore)
                    itemSwitchedShippment = true;
                    ShippingChangedLineItemArray.push(pli.UUID);
                    let purchaseLimit = BopisOrderLimits.getPurchaseLimit(pli.product, altPreferredStore);
                    if (pli.quantityValue > pli.custom[altPropValue] || pli.quantity > purchaseLimit) {
                        let newQuantity = purchaseLimit > pli.custom[altPropValue] ? pli.custom[altPropValue] : purchaseLimit;
                        pli.setQuantityValue(newQuantity);
                    }
                    //Line item messaging
                    let messaging = !empty(pli.custom.lineItemMessaging) ? JSON.parse(pli.custom.lineItemMessaging) : { messages: [] };
                    let message = switchingToSTH ? Resource.msg('item.pickup.to.shipment.moved', 'cart', null) : Resource.msg('item.shipment.to.pickup.moved', 'cart', null);
                    messaging.messages.push({ message: message, type: "SFT" });
                    pli.custom.lineItemMessaging = JSON.stringify(messaging);

                }

                else {
                    let purchaseLimit = BopisOrderLimits.getPurchaseLimit(pli.product, pli.custom.fromStoreId);
                    if (pli.quantityValue > pli.custom[invPropValue] || pli.quantity > purchaseLimit) {
                        let newQuantity = purchaseLimit > pli.custom[invPropValue] ? pli.custom[invPropValue] : purchaseLimit;
                        pli.setQuantityValue(newQuantity);
                        QuantityErrorLineItemArray.push(pli.UUID);
                        request.custom.c_basketError = "LowInventory";
                    }
                }
            }
        })
        let duplicatePlis = getDuplicatePLIs(basket);
        if (!empty(duplicatePlis)) {
            let data = mergeDuplicatePLIs(basket, QuantityErrorLineItemArray, duplicatePlis);
            QuantityErrorLineItemArray = data.QuantityErrorLineItemArray.filter(e => !data.UUIDsToFilterOut.some(j => j === e));
            ShippingChangedLineItemArray = ShippingChangedLineItemArray.filter(e => !data.UUIDsToFilterOut.some(j => j === e));
        }
        removeEmptyShipments(basket, preferredStore);
    }
    return { itemSwitchedShippment, QuantityErrorLineItemArray, ShippingChangedLineItemArray }
}


/**
 *Removes empty shipments from the basket
 * @function removeEmptyShipments
 * @memberof Bopis
 * @param {Basket} basket - Current Basket
 * @param {String} preferedStore - Current prefered store
 */
function removeEmptyShipments(basket, preferedStore) {
    const shippingShipment = getShipment(basket, '');
    const storePickupShipment = preferedStore ? getShipment(basket, preferedStore) : null;
    let badShipments = [];
    basket.shipments.toArray().forEach(shipment => {
        const shipmentOnlyHasBagFee = BopisHelper.shipmentHasJustBagFee(shipment)
        //Remove Bag Fee from Shipment
        if (shipmentOnlyHasBagFee) {
            const bagFeeItem = BopisHelper.getBagFeeInBasket(basket);
            if (!empty(bagFeeItem)) {
                basket.removeProductLineItem(bagFeeItem);
            }
        }
        if (shipment.getProductLineItems().isEmpty() && shipment.getGiftCertificateLineItems().isEmpty()) {
            if (shipment.isDefault()) {
                let shipmentToCopy = null;
                if (!empty(shippingShipment) && !shippingShipment.isDefault() && (!shippingShipment.getProductLineItems().isEmpty() || !shippingShipment.getGiftCertificateLineItems().isEmpty())) {
                    shipmentToCopy = shippingShipment;
                }
                else if (!empty(storePickupShipment) && !storePickupShipment.isDefault() && (!storePickupShipment.getProductLineItems().isEmpty() || !storePickupShipment.getGiftCertificateLineItems().isEmpty())) {
                    shipmentToCopy = storePickupShipment
                }

                if (!empty(shipmentToCopy)) {
                    shipment.custom.fromStoreId = shipmentToCopy.custom.fromStoreId;
                    shipment.custom.shipmentType = shipmentToCopy.custom.shipmentType;
                    if (!empty(shipmentToCopy.shippingAddress)) {
                        BopisHelper.copyShippingAddressToShipment(shipmentToCopy.shippingAddress, shipment);
                    }
                    else {
                        shipment.createShippingAddress();
                    }
                    shipmentToCopy.productLineItems.toArray().forEach(pli => {
                        pli.setShipment(shipment);
                    });
                    shipmentToCopy.giftCertificateLineItems.toArray().forEach(gcli => {
                        gcli.setShipment(shipment);

                    });
                    shipment.setShippingMethod(shipmentToCopy.getShippingMethod());
                    badShipments.push(shipmentToCopy);
                }
            } else {
                badShipments.push(shipment);
            }
        }
    });
    badShipments.forEach(shipment => {
        basket.removeShipment(shipment);
    });

    if (storePickupShipment) {
        BopisHelper.validateBagFeesInBasket(basket, StoreMgr.getStore(basket.custom.preferredStore))
    }

}

/**
 * Switch an item from STH/Bopis
 * @function switchShipment
 * @memberof Basket
 * @param {Basket} basket - the Current basket
 * @param {ProductLineItem} pli - the product that the shipment will be attached to
 * @param {Shipment} shipment - The shipment to assign to the pli
 * @param {ShippingMethod} shipMethod - shipping method desired for shipment
 * @param {String} inventoryType - storeInventory / webInventory
 * @param {String} shipmentType - 'web' / 'instore'
 * @param {*} preferredStore - the preferredStore store
 */
function switchShipment(basket, pli, shipment, shipMethod, inventoryType, shipmentType, preferredStore) {
    if (empty(shipment)) {
        shipment = basket.createShipment(UUIDUtils.createUUID());
        if (shipmentType && preferredStore) {
            shipment.custom.shipmentType = shipmentType;
            shipment.custom.fromStoreId = preferredStore;
        }
        shipment.setShippingMethod(shipMethod);
        pli.setShipment(shipment);
    } else {
        pli.setShipment(shipment);
    }
    if (inventoryType in pli.custom && pli.quantityValue > pli.custom[inventoryType]) {
        pli.setQuantityValue(pli.custom[inventoryType]);
    }
}


/**
 * Returns and duplicate pli's on the basket based on product and shipment type
 * @function getDuplicatePLIs
 * @memberof Basket
 * @param {Basket} basket - the Current basket
 * @return {Object}
 */
function getDuplicatePLIs(basket) {
    let duplicatePlis = [];
    basket.productLineItems.toArray().forEach(pli => {
        if (pli.custom.isGiftCard || pli.bonusProductLineItem) {
            return;
        }
        let pliKey = pli.productID + '_' + pli.shipment.shippingMethodID;
        let entry = duplicatePlis.find(e => e.productKey === pliKey);
        if (empty(entry)) {
            duplicatePlis.push({ productKey: pliKey, lines: [pli] });
        }
        else {
            entry.lines.push(pli);
        }
    });
    return duplicatePlis.filter(e => e.lines.length > 1);
}

/**
 *  Merges duplicate pli's and returns uuids of products that had quantity error or product merged messaging.
 * @function mergeDuplicatePLIs
 * @memberof Basket
 * @param {Basket} basket - the Current basket
 * @param {Array[String]} QuantityErrorLineItemArray - Array of uuids that have had the quantity altered
 * @param {Array[Object]} duplicatePlis - Array of duplicate pli objects.
 * @return {Object}
 */
function mergeDuplicatePLIs(basket, QuantityErrorLineItemArray, duplicatePlis) {
    // Create an array to store PLI keys (combination of product_id and shipment)
    let UUIDsToFilterOut = [];
    duplicatePlis.forEach(entry => {
        let entryToKeep = entry.lines[0];
        let targetTotal = entry.lines.reduce((a, b) => a + b.getQuantity().value, 0);
        let limit = BopisOrderLimits.getPurchaseLimit(entryToKeep.product, entryToKeep.custom.fromStoreId);
        let lineItemOnBasket = basket.productLineItems.toArray().find(e => e.UUID === entryToKeep.UUID);
        if (!limit) {
            limit = 25;
        }
        if (targetTotal <= limit && !empty(entryToKeep.custom.fromStoreId) && entryToKeep.custom.storeInventory >= targetTotal) {
            lineItemOnBasket.setQuantityValue(targetTotal);
            request.custom.productMerged = true;
        } else if (targetTotal <= limit && empty(entryToKeep.custom.fromStoreId) && entryToKeep.custom.webInventory >= targetTotal) {
            entryToKeep.setQuantityValue(targetTotal);
            request.custom.productMerged = true;
        } else if (entryToKeep.custom.storeInventory <= limit && !empty(entryToKeep.custom.fromStoreId) && entryToKeep.custom.storeInventory < targetTotal) {
            entryToKeep.setQuantityValue(entryToKeep.custom.storeInventory);
            request.custom.productMergedQtyChanged = true;
        } else if (entryToKeep.custom.webInventory <= limit && empty(entryToKeep.custom.fromStoreId) && entryToKeep.custom.webInventory < targetTotal) {
            entryToKeep.setQuantityValue(entryToKeep.custom.webInventory);
            request.custom.productMergedQtyChanged = true;
        } else if (targetTotal <= limit) {
            //Utilize previously set qty due to inventory not being avaiable
            entryToKeep.setQuantityValue(entryToKeep.getQuantity().value);
            request.custom.productMergedQtyChanged = true;
        } else {
            entryToKeep.setQuantityValue(limit);
            request.custom.productMergedQtyChanged = true;
        }
        QuantityErrorLineItemArray.push(entryToKeep.UUID);
        if (entry instanceof Array) {
            entry.slice(1).forEach(pli => {
                basket.removeProductLineItem(pli);
                UUIDsToFilterOut.push(pli.UUID);
            });
        }
    });
    return { QuantityErrorLineItemArray, UUIDsToFilterOut };
}

/**
 * Checks if a basket is valid for checkout
 * @function validate
 * @memberof Basket
 * @param {Basket} basket
 * @returns {object} { BasketStatus : (Status), EnableCheckout: (Bool) }
 */
function validate(basket) {
    const Status = require('dw/system/Status');
    const storeId = basket.custom.preferredStore;
    const returnObj = {
        BasketStatus: new Status(Status.OK),
        EnableCheckout: true
    };

    //prices are Available && no bad Product On Basket
    if (!basket.merchandizeTotalPrice.available) {
        returnObj.BasketStatus = new Status(Status.ERROR);
        returnObj.EnableCheckout = false;
    }
    else if (!Site.getCustomPreferenceValue('EnableRemoveExpiredCouponCodes') &&!basket.getCouponLineItems().toArray().every(e => e.isValid())) {
        returnObj.BasketStatus = new Status(Status.ERROR, 'CouponError');
        returnObj.EnableCheckout = false;
    }//Basket not empty
    else if (!(basket.getProductLineItems().size() !== 0 || basket.getGiftCertificateLineItems().size() !== 0)) {
        returnObj.BasketStatus = new Status(Status.OK);
        returnObj.EnableCheckout = false;
    } //Taxes on basket
    else if (!basket.totalTax.available) {
        returnObj.BasketStatus = new Status(Status.ERROR, 'TaxError');
        returnObj.EnableCheckout = false;
    }// Basket isn't a 0 dollar order
    else if (basket.totalNetPrice.value <= 0) {
        returnObj.BasketStatus = new Status(Status.ERROR, 'ZeroDollarOrder');
        returnObj.EnableCheckout = false;
    } //All bopis is not offline and the basket contains a bopis shipment
    else if (!empty(storeId) && !empty(getShipment(basket, storeId)) && !sitePrefHelper.getSitePrefValue('enableStorePickUp')) {
        returnObj.BasketStatus = new Status(Status.ERROR, 'AllBopisOffline');
        returnObj.EnableCheckout = false;
    }
    else if (!empty(storeId) && !empty(getShipment(basket, storeId)) && !BopisOrderLimits.isBopisStoreAvailable(storeId)) {
        returnObj.BasketStatus = new Status(Status.ERROR, 'SelectBopisOffline');
        returnObj.EnableCheckout = false;
    }
    else if (doesBasketHaveUnavailableProducts(basket, storeId)) {
        returnObj.BasketStatus = new Status(Status.ERROR, 'LOWINVENTORY');
        returnObj.EnableCheckout = false;
    }
    //Guest customer with auto refresh item in basket
    else if (basket.customer.anonymous && basket.productLineItems.toArray().some(e => e.custom.isAutoRefreshSubscribedItem)) {
        returnObj.BasketStatus = new Status(Status.ERROR, 'GuestBasketARItem');
        returnObj.EnableCheckout = false;
    }
    else {
        const limitData = isBasketOverCategoryLimit(basket);
        if (limitData.isOver) {
            let data = {
                message: StringUtils.format(Site.getCustomPreferenceValue('basketLimitCartBannerMessage'), limitData.limit, limitData.category, (limitData.amountCounted - limitData.limit), "'"),
                limitData: limitData
            };
            returnObj.BasketStatus = new Status(Status.ERROR, 'BASKETLIMIT', JSON.stringify(data));
            returnObj.EnableCheckout = false;
        }
    }

    return returnObj;
}

/**
 * validates the product items in the basket are available
 * @function doesBasketHaveUnavailableProducts
 * @memberof Basket
 * @param {dw.order.Basket} basket
 * @param {string} storeid the store id associated with the basket
 */
function doesBasketHaveUnavailableProducts(basket, storeid) {
    let basketHasBadProduct = basket.getProductLineItems().toArray().some(pli => {
        let pliIsBad = empty(pli.product) || !pli.product.online;
        const bagFeeSKUs = BopisHelper.getBagFeeSKUs();
        if (!pliIsBad && !bagFeeSKUs.some(e => e === pli.productID)) {
            if (pli.custom.hasOwnProperty('fromStoreId') && !empty(pli.custom.fromStoreId) && !empty(storeid) && pli.custom.fromStoreId == storeid) {
                if (pli.custom.hasOwnProperty('storeInventory') && !empty(pli.custom.storeInventory) && BopisHelper.isBopisEnabled()) {
                    pliIsBad = pli.custom.storeInventory < pli.quantityValue;
                }
            } else {
                let invRecord = pli.product.getAvailabilityModel().getInventoryRecord();
                if (pli.custom.hasOwnProperty('webInventory') && !empty(pli.custom.webInventory) && invRecord.perpetual == false) {
                    pliIsBad = pli.custom.webInventory < pli.quantityValue;
                } else {
                    let availabilityLevels = pli.product.getAvailabilityModel().getAvailabilityLevels(pli.quantityValue);
                    pliIsBad = availabilityLevels.getNotAvailable().value < 0;
                }
            }
        }
        return pliIsBad;
    })
    return basketHasBadProduct;
}

/**
 * Counts the number of unavailable product items in the basket
 * @function countUnavailableProducts
 * @memberof Basket
 * @param {dw.order.Basket} basket
 * @param {string} storeid the store id associated with the basket
 * @return {number} count of unavailable products
 */
function countUnavailableProducts(basket, storeid) {
    const bagFeeSKUs = BopisHelper.getBagFeeSKUs();

    return basket.getProductLineItems().toArray().reduce((count, pli) => {
        let pliIsBad = empty(pli.product) || !pli.product.online;
        if (!pliIsBad && !bagFeeSKUs.some(e => e === pli.productID)) {
            if (pli.custom.hasOwnProperty('fromStoreId') && !empty(pli.custom.fromStoreId) && !empty(storeid) && pli.custom.fromStoreId == storeid) {
                if ((pli.custom.hasOwnProperty('storeInventory') && !empty(pli.custom.storeInventory)) || !pli.custom.c_hasInvInNearbyStores) {
                    pliIsBad = pli.custom.storeInventory < pli.quantityValue;
                }
            } else {
                let invRecord = pli.product.getAvailabilityModel().getInventoryRecord();
                if (pli.custom.hasOwnProperty('webInventory') && !empty(pli.custom.webInventory) && invRecord.perpetual == false) {
                    pliIsBad = pli.custom.webInventory < pli.quantityValue;
                } else {
                    let availabilityLevels = pli.product.getAvailabilityModel().getAvailabilityLevels(pli.quantityValue);
                    pliIsBad = availabilityLevels.getNotAvailable().value < 0;
                }
            }
        }
        return pliIsBad ? count + 1 : count;
    }, 0);
}

/**
 * Returns based on if bag fees exsist on the basket
 * @function hasBagFees
 * @memberof Basket
 * @param {Basket} basket - current user's basket
 * @return {Boolean} Returns true if bag fees exsist on the basket
 */
function hasBagFees(basket) {
    const bagFeeSkus = dw.system.Site.current.getCustomPreferenceValue('bagFeeSkus');
    if (!empty(bagFeeSkus)) {
        return basket.getProductLineItems().toArray().some(e => bagFeeSkus.indexOf(e.productID) > -1);
    }
    return false;
}

/**
 * Returns the total cost of bag fees on the basket
 * @function getBagFeeTotal
 * @memberof Basket
 * @param {Basket} basket - current user's basket
 * @return {Money} - Total cost of bag fees
 */
function getBagFeeTotal(basket) {
    const bagFeeSkus = dw.system.Site.current.getCustomPreferenceValue('bagFeeSkus');
    if (!empty(bagFeeSkus)) {
        let instancesOfBagFees = basket.getProductLineItems().toArray().filter(e => bagFeeSkus.indexOf(e.productID) > -1);
        let total = instancesOfBagFees.reduce((a, b) => a.add(b.getPrice()), new dw.value.Money(0, basket.getCurrencyCode()));
        return total;
    }
    return new dw.value.Money(0, basket.getCurrencyCode());
}

/**
 * Returns based on if giftbox exsist on the basket
 * @function hasGiftBoxPLI
 * @memberof Basket
 * @param {Basket} basket - current user's basket
 * @return {Boolean} - Returns true if giftbox exsist on the basket
 */
function hasGiftBoxPLI(basket) {
    return basket.getProductLineItems(dw.system.Site.current.getCustomPreferenceValue('GiftBoxSKU')).size() > 0;
}

/**
 * Returns the total cost of gift box on the basket
 * @function getGiftBoxTotal
 * @memberof Basket
 * @param {Basket} basket - current user's basket
 * @return {Money} - Total cost of gift box
 */
function getGiftBoxTotal(basket) {
    let pli = basket.getProductLineItems(dw.system.Site.current.getCustomPreferenceValue('GiftBoxSKU'));
    return empty(pli) ? new dw.value.Money(0, basket.getCurrencyCode()) : pli.getPrice();
}
/**
 * Updates the basket state string on the basket if
 * anything in basket chages to keep track of the current
 * state of the basket
 * @function updateBasketState
 * @memberof Basket
 * @param {Basket} basket - current user's basket
 */
const updateBasketState = (basket) => {
    try {
        request.custom.skipTax = false;
        request.custom.skipCartCal = false;
        const cartStateString = getStateString(basket);
        /**
         * if State String has not changeded to not re calculate or get tax again.
         */
        if (('cartStateString' in basket.custom && !empty(basket.custom.cartStateString)) &&
            (cartStateString == basket.custom.cartStateString)) {
            request.custom.skipTax = true;
            request.custom.skipCartCal = true;
        }
        basket.custom.cartStateString = cartStateString;
    } catch (e) {
        logHandler.logHandler.logger.error(e, 'CustomAPI', 'SaveBasketState.js:');
    }
}

/**
 * Builds a state string based on the current basket
 * @function updateBasketState
 * @memberof Basket
 * @param {Basket} basket - current user's basket
 * @returns {String} - The state string.
 */
function getStateString(basket) {
    let cartStateString = '';
    const productLineItems = basket.getAllProductLineItems();
    cartStateString += productLineItems.toArray().reduce((a, b) => a + b.productID + ';' + b.quantityValue + ';' + b.adjustedPrice + ';' + b.productInventoryListID + '|', '');
    const gifts = basket.getGiftCertificateLineItems();
    cartStateString += gifts.toArray().reduce((a, b) => a + b.giftCertificateID + ';' + b.priceValue + '|', '');
    cartStateString += basket.adjustedShippingTotalPrice.valueOrNull + '|' + basket.adjustedMerchandizeTotalPrice.valueOrNull + '|' + basket.totalNetPrice.valueOrNull;
    if (Site.getCustomPreferenceValue('20956_GrossTotalFix')) {
        cartStateString += "|" + basket.totalGrossPrice.valueOrNull;
    }
    /**
     * Append shipping address of each shipment
     */
    const shipments = basket.getShipments().toArray().filter(e => !empty(e.shippingAddress));
    cartStateString += shipments.reduce((a, b) => {
        let c = b.shippingAddress;
        a += '|' + (!empty(c.stateCode) ? c.stateCode : null);
        a += '|' + (!empty(c.city) ? c.city : null);
        a += '|' + (!empty(c.countryCode) ? c.countryCode.displayValue : null);
        a += '|' + (!empty(c.postalCode) ? c.postalCode : null);
        a += '|' + (!empty(b.shippingMethodID) ? b.shippingMethodID : null) + '|';
        return a;
    }, '')


    const couponLineItems = basket.couponLineItems;
    cartStateString += couponLineItems.toArray().reduce((a, b) => a + '|' + b.couponCode, '');

    /**
     * due to DW quota limit on string length which can be stored in session we should used MD5 supported by WeakMessageDigest
     */
    const hash = dw.crypto.WeakMessageDigest(dw.crypto.WeakMessageDigest.DIGEST_MD5).digestBytes(dw.util.Bytes(cartStateString));
    cartStateString = dw.crypto.Encoding.toHex(hash);
    return cartStateString;
}

/**
 * clear radial tax data on baske
 * @function clearTaxData
 * @memberof Basket
 * @param {dw.order.Basket} basket - current user's basket
 */
function clearTaxData(basket) {
    basket.custom.PrevTaxCallStatus = null;
    basket.custom.RadialTaxTransactionId = null;
    basket.getAllProductLineItems().toArray().forEach(pli => {
        pli.custom.RadialMerchandiseTaxes = null;
        pli.custom.RadialShippingTaxes = null;
        pli.custom.RadialDutyTaxes = null;
        pli.custom.radialDutyAmount = null;
        pli.custom.radialLineItemTaxXML = null;
    });
    basket.getGiftCertificateLineItems().toArray().forEach(gcli => {
        gcli.custom.RadialMerchandiseTaxes = null;
        gcli.custom.RadialShippingTaxes = null;
        gcli.custom.RadialDutyTaxes = null;
        gcli.custom.radialDutyAmount = null;
        gcli.custom.radialLineItemTaxXML = null;
    });
    basket.getShipments().toArray().forEach(shipment => {
        shipment.custom.bagFeeCharge = null;
        shipment.custom.bagFeeName = null;
        shipment.custom.taxDeliveryFee = null;
        shipment.custom.taxDeliveryFeeName = null;
    });
}

/**
 * Updates the `fromStoreId` custom attribute for all product line items in the given basket.
 * It retrieves the `fromStoreId` from the shipment if it exists and assigns it to each product line item.
 *
 * @param {dw.order.Basket} basket - The basket containing the product line items to be updated.
 * @return {void} This function does not return a value.
 */
function updatePLIBOPISData(basket) {
    basket.getAllProductLineItems().toArray().forEach(pli => {
        let shipment = pli.getShipment();
        let fromStoreId = null;
        if ('fromStoreId' in shipment.custom && shipment.custom.fromStoreId) {
            fromStoreId = shipment.custom.fromStoreId;
        }
        pli.custom.fromStoreId = fromStoreId;
    });
}

/**
 * Cleans up product level messaging on product line items
 * @function cleanUpProductLevelMessaging
 * @memberof Basket
 * @param {Basket} basket - current user's basket
 */
function cleanUpProductLevelMessaging(basket) {
    basket.getProductLineItems().toArray().forEach(pli => {
        if ('lineItemMessaging' in pli.custom && !empty(pli.custom.lineItemMessaging)) {
            pli.custom.lineItemMessaging = null;
        }
    });
}

/**
 * @param {*} radialAddress
 * @param {*} address
 */
function handleShippingAddressUpdate(address, radialAddress) {
    Object.keys(radialAddress).forEach(key => {
        if (key in address && key !== "ID") {
            address[key] = radialAddress[key].toString()
        } else if (key == 'postal') {
            address['postalCode'] = radialAddress[key];
        }
    })
    return address;
}

/**
 * checks if a basket has at least one empty shipping address and one shipping method
 * @function isValidShipping
 * @memberof Basket
 * @param {dw.order.Basket} basket - the basket containing the shipping addresses
 * @returns {Boolean} true if basket has at least one empty shipping address; false otherwise
 */
function isValidShipping(basket) {
    let shipments = basket.getShipments().toArray();
    const EGC_SHIPPING_METHOD_ID = Site.getCustomPreferenceValue("bbwEGCShippingMethodID");
    return !shipments.some(shipment => {
        if (shipment.shippingMethodID === EGC_SHIPPING_METHOD_ID || shipmentHelper.hasOnlyEGCs(shipment)) {
            return false;
        }
        const address = shipment.getShippingAddress();
        return empty(address) || empty(address.stateCode) || empty(shipment.getShippingMethodID());
    })
}

/**
 * Gets the basket classification based on the shipments
 * @function getBasketType
 * @memberof Basket
 * @param {Basket} basket - current user's basket
 */
function getBasketType(basket) {
    let ispuShipment = getShipment(basket, basket.custom.preferredStore);
    let sthShipment = getShipment(basket);
    let hasRealISPUShipment = !empty(ispuShipment) && (!empty(ispuShipment.getProductLineItems()) || !empty(ispuShipment.getGiftCertificateLineItems()));
    let hasRealSTHShipment = !empty(sthShipment) && (!empty(sthShipment.getProductLineItems()) || !empty(sthShipment.getGiftCertificateLineItems()));
    if (hasRealISPUShipment && hasRealSTHShipment) {
        return 'MIXED';
    }
    else if (hasRealSTHShipment) {
        return 'STH';
    }
    else if (hasRealISPUShipment) {
        return 'BOPIS';
    }
    return 'NA';
}

/**
 * Checks if the basket contains auto refresh items.
 * @function basketContainsARItems
 * @memberof Basket
 * @param {Basket} basket - current user's basket
 * @return {Boolean} true if basket has AR items
 */
function basketContainsARItems(basket) {
    return basket.getProductLineItems().toArray().some(e => e.custom.isAutoRefreshSubscribedItem);
}

/**
* Updates the pli's on basket with accurate inventory
 * @function setInventoryOnPLIs
 * @memberof Basket
 * @param {Basket} basket - current user's basket
 */
function setInventoryOnPLIs(basket) {
    let invData = InvService.getInventoryForBasket(basket);
    basket.productLineItems.toArray().forEach(pli => {
        let invEntrys = invData.filter(e => e.lineId.indexOf(pli.productID) !== -1);
        if (!empty(invEntrys)) {
            const webInventory = invEntrys.find(e => e.lineId.indexOf('STH') !== -1)
            const storeInventory = invEntrys.find(e => e.lineId.indexOf('ISPU') !== -1)

            pli.custom.webInventory = !empty(webInventory) ? webInventory.qty : 0;
            pli.custom.storeInventory = !empty(storeInventory) ? storeInventory.qty : 0;
        }
    });
}

/**
 * Resets custom attributes on the basket
 * @function resetBasket
 * @memberof Basket
 * @param {Basket} basket - current user's basket
 */
function resetBasket(basket) {
    basket.custom.pcipalSessionId = null;
    basket.custom.accessToken = null;
    basket.custom.refreshToken = null;
    basket.custom.pcipalSessionTimeToExpired = null;
}

/**
 * @function clearGiftMessaging
 * @memberof Basket
 * @param {Basket} basket
 */
function clearGiftMessaging(basket) {
    const shipments = basket.shipments.toArray();
    shipments.forEach((shipment) => {
        if (shipment.gift) {
            shipment.gift = false;
            shipment.giftMessage = '';
        }
    });
}

/**
 * @function clearExpiredCoupon
 * @memberof Basket
 * @param {Basket} basket
 */
function clearExpiredCoupon(basket) {
    if (Site.getCustomPreferenceValue('EnableRemoveExpiredCouponCodes')) {
        basket.custom.expiredCouponRemoved = false;
        const expiredCouponsInBasket = basket.getCouponLineItems().toArray().filter(cli => {
            let parentCoupon = CouponMgr.getCouponByCode(cli.couponCode);
            return empty(parentCoupon) || !cli.isValid() ||!parentCoupon.enabled || parentCoupon.getPromotions().empty || !parentCoupon.getPromotions().toArray().some(e => e.active);
        });
        if (!empty(expiredCouponsInBasket)) {
            expiredCouponsInBasket.forEach(cli => {
                basket.removeCouponLineItem(cli);
            });
            basket.custom.expiredCouponRemoved = true;
            handleAddingDissmisableMessages(basket, 'expiredCouponRemoved');
        }
    }
}

/**
 * Defines the clasification of the basket
 * @function getCategorizationString
 * @memberof CreateOrder
 * @param {dw.order.LineItemCtnr} order the current order object
 * @returns {String}
 */
function getCategorizationString(order) {
    let string = '';
    order.getAllLineItems().toArray().forEach(li => {
        let type = decideLineItemType(li);
        if (!empty(type) && !string.includes(type)) {
            string = string + type + '|';
        }
    });
    return string;
}

/**
 * Determines a prefix to classify the passed in line item
 * @function decideLineItemType
 * @memberof RadialHelper
 * @param {dw.order.LineItem} lineItem - Line item
 * @return {String} - Returns the defineing prefix for line item
 */
function decideLineItemType(lineItem) {
    if (lineItem instanceof dw.order.GiftCertificateLineItem) {
        return lineItem.custom.isVirtual ? 'EGC' : 'PGC';
    } else if (lineItem instanceof dw.order.ProductLineItem) {
        if (!empty(lineItem.product) && lineItem.product.custom.isGiftCard) {
            return lineItem.product.custom.isVirtual ? 'EGC' : 'PGC';
        } else {
            return !empty(lineItem.custom.fromStoreId) ? 'BOPIS' : 'STH';
        }
    }
    return '';
}

/**
 * Checks if a basket only has gcs
 * @function hasOnlyGCs
 * @memberof Basket
 * @param {Basket} basket
 */
function hasOnlyGCs(basket) {
    if (empty(basket)) {
        return false;
    }
    return basket.shipments.toArray().every(e => shipmentHelper.hasOnlyGCs(e));
}

/**
 * Checks if a basket only has egcs
 * @function hasOnlyEGCs
 * @memberof Basket
 * @param {Basket} basket
 */
function hasOnlyEGCs(basket) {
    if (empty(basket)) {
        return false;
    }
    return basket.shipments.toArray().every(e => shipmentHelper.hasOnlyEGCs(e));
}

/**
 * Defines the clasification of the basket
 * @function getCategorizationString
 * @memberof CreateOrder
 * @param {dw.order.LineItemCtnr} basket the current order object
 * @returns {String}
 */
function getCategorizationString(basket) {
    let string = '';
    basket.getAllLineItems().toArray().forEach(li => {
        let type = decideLineItemType(li);
        if (!empty(type) && !string.includes(type)) {
            string = string + type + '|';
        }
    });
    return string;
}

/**
 * Determines a prefix to classify the passed in line item
 * @function decideLineItemType
 * @memberof CreateOrder
 * @param {dw.order.LineItem} lineItem - Line item
 * @return {String} - Returns the defineing prefix for line item
 */
function decideLineItemType(lineItem) {
    if (lineItem instanceof dw.order.GiftCertificateLineItem) {
        return lineItem.custom.isVirtual ? 'EGC' : 'PGC';
    } else if (lineItem instanceof dw.order.ProductLineItem) {
        if (!empty(lineItem.product) && lineItem.product.custom.isGiftCard) {
            return lineItem.product.custom.isVirtual ? 'EGC' : 'PGC';
        } else {
            return !empty(lineItem.custom.fromStoreId) ? 'BOPIS' : 'STH';
        }
    }
    return '';
}

/**
 * Determines if basket is over basket level category limits
 * @function isBasketOverCategoryLimit
 * @memberof Basket
 * @param {dw.order.Basket} basket - the Basket
 * @return {Object} - Returns object with limit data
 */
function isBasketOverCategoryLimit(basket) {
    if (Site.getCustomPreferenceValue('basketLimitEnabled')) {
        const basketLimit = Site.getCustomPreferenceValue('BasketLimits');
        const basketLimitObj = !empty(basketLimit) ? JSON.parse(basketLimit) : null;
        const basketData = getBasketLimitData(basket);
        if (!empty(basketLimitObj)) {
            for (let primaryCategoryId in basketLimitObj) {
                let limit = basketLimitObj[primaryCategoryId];
                if (!empty(basketData.basket) && !empty(basketData.basket[primaryCategoryId])) {
                    let count = basketData.basket[primaryCategoryId].quantity;
                    if (!empty(count) && count > limit) {
                        let categoryName = basketData.basket[primaryCategoryId].categoryName ? basketData.basket[primaryCategoryId].categoryName : primaryCategoryId;
                        return { isOver: true, category:categoryName, items: basketData.basket[primaryCategoryId].items, skus: basketData.basket[primaryCategoryId].skus, limit: limit, amountCounted: count };
                    }
                }
            }
        }
    }
    return { isOver: false };
}

/**
 * Gets limit data for a specific category on the basket
 * @function getLimitDataForCategory
 * @memberof Basket
 * @param {String} category - the desired category to get data for
 * @param {Object} basketData - data from getBasketLimitData
 * @return {Object} - Returns object with limit data
 */
function getLimitDataForCategory(category, basketData) {
    if (empty(category) || empty(basketData)) {
        return null;
    }
    const basketLimit = Site.getCustomPreferenceValue('BasketLimits');
    const basketLimitObj = !empty(basketLimit) ? JSON.parse(basketLimit) : null;
    if (!empty(basketLimitObj) && !empty(basketLimitObj[category])) {
        let entry = basketData.basket[category];
        return { isOver: true, category: category, items: entry.items, skus: entry.skus, limit: basketLimitObj[category], amountCounted: entry.quantity };
    }
}

/**
 * Gets the counts / uuids / skus for all items in the basket and the primary categories they go with
 * @function getBasketLimitData
 * @memberof Basket
 * @param {dw.order.Basket} basket - data from getBasketLimitData
 * @return {Object} - Returns object counts of the diffrent primary categories in the basket
 */
function getBasketLimitData(basket) {
    let basketCounts = {};
    basket.shipments.toArray().forEach(shipment => {
        shipment.productLineItems.toArray().forEach(pli => {
            if (!empty(pli.product.primaryCategory)) {
                let categoryID = pli.product.primaryCategory.ID;
                if (empty(basketCounts[categoryID])) {
                    basketCounts[categoryID] = { quantity: 0, items: [], skus: [] , categoryName : ''};
                }
                basketCounts[categoryID].quantity = basketCounts[categoryID].quantity + pli.quantity.value
                basketCounts[categoryID].items.push(pli.UUID);
                if (!basketCounts[categoryID].skus.includes(pli.productID)) {
                    basketCounts[categoryID].skus.push(pli.productID);
                }
                basketCounts[categoryID].categoryName = pli.product.primaryCategory.displayName;
            }
        });
    });
    return { basket: basketCounts }
}


/**
 *
 * @param {*} basket
 * @param {*} msgID
 */
function handleAddingDissmisableMessages(basket, msgID) {
    basket.custom.dissmisableBannerMessages = [msgID].concat(basket.custom.dissmisableBannerMessages);
}

function handleRemoveDissmisableMessages(basket, msgID) {
    let newMessageArray = [];
    basket.custom.dissmisableBannerMessages.forEach((currentMsgID) => {
        if (currentMsgID != msgID) {
            newMessageArray.push(currentMsgID)
        }
    })
    basket.custom.dissmisableBannerMessages = newMessageArray;
}

module.exports = {
    getExsistingLineItemInCart,
    getShipment,
    getFreeItemCount,
    getFakeLineItemQuantity,
    getLineItemsWithFakeLineItems,
    switchFullfilmentBasedOnAvailability,
    switchShipment,
    validate,
    hasBagFees,
    getBagFeeTotal,
    hasGiftBoxPLI,
    getGiftBoxTotal,
    updateBasketState,
    clearTaxData,
    doesBasketHaveUnavailableProducts,
    countUnavailableProducts,
    setInventoryOnPLIs,
    resetBasket,
    cleanUpProductLevelMessaging,
    handleShippingAddressUpdate,
    isValidShipping,
    getStateString,
    getBasketType,
    basketContainsARItems,
    removeEmptyShipments,
    clearGiftMessaging,
    clearExpiredCoupon,
    hasOnlyGCs,
    updatePLIBOPISData,
    getCategorizationString,
    isBasketOverCategoryLimit,
    getBasketLimitData,
    getLimitDataForCategory,
    handleAddingDissmisableMessages,
    handleRemoveDissmisableMessages,
    hasOnlyEGCs
};
