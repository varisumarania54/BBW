/**
 * These functions are used ProductLineItems.
 * @namespace ProductLineItems
 */
'use strict'
const HashMap = require('dw/util/HashMap');
const ProductInventoryMgr = require('dw/catalog/ProductInventoryMgr');
const Bopishelper = require('app_composable/cartridge/scripts/helpers/global/BopisOrderLimits.js');
const Inventory = require('app_radial/cartridge/scripts/inventory/Inventory.js');
const StoreHelper = require('dw/catalog/StoreMgr');
const ProductHelper = require('app_composable/cartridge/scripts/helpers/objects/product.js');
const StoreMgr = require('dw/catalog/StoreMgr');
/**
 * Sets the PLI custom attribute storeInventory and webInventory based on
 * succesfull radial inventory look up or on SFCC on failed look up
 * @function updatePliCustomAttributeWithRadialInventory
 * @memberof ProductLineItems
 * @param {Array[products]} products
 * @param {string} storeID
 * @param {boolean} isReserveInventoryError
 */
function updatePliCustomAttributeWithRadialInventory(products, storeID, isReserveInventoryError) {
    let radialWebInventoryMap = new HashMap();
    let radialStoreInventoryMap = new HashMap();
    let nonBopisQuantityResponse = null;
    let bopisQuantityResponse = null;

    const store = !empty(storeID) ? StoreMgr.getStore(storeID) : null

    // Allocation logic will be added in a later ticket
    //leaving comments for reference.

    //Handles utilizing response from Allocation if enabled
    // var allocationResponse = null;
    // if(InventoryAllocateHelper.isRespectAllocateEnabled()){
    // 	if(session.custom.IS_APPLE_PAY_ORDER_LOW_INVENTORY == true || session.custom.isReserveInventoryError == true){
    // 		isReserveInventoryError = true;
    // 	}

    // 	allocationResponse = InventoryAllocateHelper.getPreviousAllocationResult();
    // }

    nonBopisQuantityResponse = Inventory.GetRadialWebInventory(products, isReserveInventoryError);
    bopisQuantityResponse = Bopishelper.isBopisStoreAvailable(store) ? Inventory.GetRadialStoreQuantityEcomm(storeID, products, isReserveInventoryError) : null

    products.toArray().forEach(pli => {
        let key = new String(pli.productID);
        if (nonBopisQuantityResponse.serviceCallStatus.isError()) {
            let invRecord = pli.product.getAvailabilityModel().getInventoryRecord();
            pli.custom.webInventory = (!empty(invRecord) && invRecord.perpetual == false) ? pli.custom.webInventory = invRecord.getATS().value : 0
        } else {
            radialWebInventoryMap = nonBopisQuantityResponse.productQuantities;
            pli.custom.webInventory = radialWebInventoryMap.containsKey(key) ? new Number(radialWebInventoryMap.get(key)) : ProductHelper.getWebInventory(pli.product);
        }

        if (bopisQuantityResponse) {
            if (bopisQuantityResponse.serviceCallStatus.isError()) {
                let storeinventory = Bopishelper.getStoreInventoryList(store);
                let inventoryListId = !empty(storeinventory) ? storeinventory.ID : null;
                pli.custom.storeInventory = inventoryListId && storeinventory && storeinventory.getRecord(pli.productID) ? storeinventory.getRecord(pli.productID).ATS.value : 0;
            } else {
                radialStoreInventoryMap = bopisQuantityResponse.productQuantities;
                pli.custom.storeInventory = radialStoreInventoryMap.containsKey(key) ? new Number(radialStoreInventoryMap.get(key)) : ProductHelper.getStoreInventory(pli.product, store);
            }
        } else {
            pli.custom.storeInventory = 0;
        }
    })
}

/**
 * Calculates the total discount percentage from all price adjustments on a PLI.
 * Converts fixed amount discounts to percentage and sums them up.
 * Handles multiple price adjustments by calculating each against the base price.
 * @function getDiscountPercentageFromPLI
 * @memberof ProductLineItems
 * @param {dw.order.ProductLineItem} pli - The product line item
 * @return {Number|null} - The total discount percentage or null if no discounts
 */
function getDiscountPercentageFromPLI(pli) {
    const basePrice = pli.basePrice;
    const priceAdjustments = pli.getPriceAdjustments();

    if (empty(priceAdjustments) || priceAdjustments.length === 0 || empty(basePrice) || basePrice.getValue() === 0) {
        return null;
    }

    const totalDiscountPercentage = priceAdjustments.toArray().reduce(function(total, priceAdjustment) {
        if (!empty(priceAdjustment.appliedDiscount) && priceAdjustment.appliedDiscount.type.toLowerCase() !== "percentage") {
            return total + (Math.abs(priceAdjustment.price.value) / (basePrice.value * pli.quantity.value)) * 100;
        } else if (!empty(priceAdjustment.appliedDiscount) && priceAdjustment.appliedDiscount.type.toLowerCase() === "percentage") {
            return total + priceAdjustment.appliedDiscount.percentage;
        }
        return total;
    }, 0);

    if (totalDiscountPercentage == 0) {
        return null;
    }

    return Math.ceil(totalDiscountPercentage * 10000) / 10000;
}


module.exports = {
    updatePliCustomAttributeWithRadialInventory,
    getDiscountPercentageFromPLI
}
