'use strict';
/**
 * @namespace Inventory
 */


const Site = require('dw/system/Site').getCurrent();
const BopisInvLimits = require('app_composable/cartridge/scripts/helpers/global/BopisOrderLimits.js');
const RomsInventory = require('int_radial_composable/cartridge/scripts/rom/inventory/getInventoryHelper.js');
const StoreMgr = require('dw/catalog/StoreMgr');
const ProductInventoryMgr = require('dw/catalog/ProductInventoryMgr');
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;
const Ocapi = require('app_composable/cartridge/scripts/services/OCAPIData.js');
const webThreshold = Site.getCustomPreferenceValue('RadialInventoryThreshold');
const storeThreshold = Site.getCustomPreferenceValue('RadialStoreInventoryThreshold');
const giftBoxSku = Site.getCustomPreferenceValue('GiftBoxSKU');
const SiteInvList = ProductInventoryMgr.getInventoryList().ID;
const ProductMgr = require('dw/catalog/ProductMgr');
const sitePrefHelper = require('app_composable/cartridge/scripts/helpers/util/sitePrefHelper');
const BopisTurnedOn = sitePrefHelper.getSitePrefValue('enableStorePickUp');
const ForceSoldOutHelper = require('app_composable/cartridge/scripts/helpers/global/ForceSoldOutHelper.js');
const ProductHelper = require('app_composable/cartridge/scripts/helpers/objects/product.js');

/**
 * Get inventory values for the passed in basket.
 * @function getInventoryForBasket
 * @memberof Inventory
 * @param {dw.order.Basket} basket - The basket we are looking to get inventory for
 * @return {[Object]} - { productId: productId, lineId: lineId , invListID :"productId_(STH|ISPU)_inventoryListID" }
 */

function getInventoryForBasket(basket) {
    let productQuantities = [];
    let requestProducts = [];
    let externalProducts = [];
    let backupData = [];
    let store = StoreMgr.getStore(basket.custom.preferredStore);
    let isPreferredStoreAvailable = !empty(store) && BopisInvLimits.isBopisStoreAvailable(store);
    let storeInvList = isPreferredStoreAvailable ? BopisInvLimits.getStoreInventoryList(store) : null;
    let webInvList = ProductInventoryMgr.getInventoryList();
    basket.productLineItems.toArray().filter((value, index, self) => self.findIndex(e => e.productID === value.productID) === index)
        .forEach(pli => {
            if (pli.productID == giftBoxSku || (pli.product.custom.isGiftCard && pli.product.custom.isVirtual)) {
                return;
            }
            handleProduct(pli.productID, productQuantities, requestProducts, backupData, webInvList, "STH", webThreshold);
            if (!empty(storeInvList)) {
                handleProduct(pli.productID, productQuantities, requestProducts, backupData, storeInvList, "ISPU_" + storeInvList.ID, storeThreshold);
            }
        })

    if (!empty(requestProducts)) {
        if (Site.getCustomPreferenceValue('UseMAOForInventory')) {
            // Inline so if the cartridge is not present it does not error the whole file
            const MAOInventory = require('int_mao_composable/cartridge/scripts/getInventoryHelper.js');
            let data = MAOInventory.getInventoryArrayProducts(requestProducts, backupData, productQuantities);
            externalProducts = data.externalProducts;
            productQuantities = data.productQuantities;
        } else {
            externalProducts = RomsInventory.getInventoryArrayProducts(requestProducts);
            productQuantities = empty(externalProducts) ? productQuantities.concat(backupData) : productQuantities.concat(externalProducts);
        }
    }

    if (Site.getCustomPreferenceValue('OverwriteSFCCInventory') && !empty(externalProducts)) {
        ZeroSFInv(externalProducts, backupData, !empty(webInvList) ? webInvList.ID : '');
    }

    return productQuantities;
}

/**
 * Updates the passed in arrays based on the evaluation of the product.
 * @function handleProduct
 * @memberof Inventory
 * @param {String} productId - The product id
 * @param {[Object]} productQuantities products that are good
 * @param {[Object]} requestProducts - products that we need to add to the radial request
 * @param {[Object]} backupData - products that we can add to the good products in the event of a radial failure
 * @param {dw.catalog.ProductInventoryList} invList - Inventory list to evaluate
 * @param {String} lineIdSuffix
 * @param {Number} threshold
 */
function handleProduct(productId, productQuantities, requestProducts, backupData, invList, lineIdSuffix, threshold) {
    if (!empty(invList)) {
        const product = ProductHelper.getProductAttributesUsingCache(productId);
        let lineId = productId + "_" + lineIdSuffix;
        if (invList.ID !== SiteInvList && (!BopisTurnedOn || empty(product.custom.availableForInStorePickup) || !product.custom.availableForInStorePickup)) {
            productQuantities.push({ productId: productId, qty: 0, lineId: lineId })
        }
        else if (invList.ID == SiteInvList && product.forceSoldOut.isForceSoldOut) {
            productQuantities.push({ productId: productId, qty: 0, lineId: lineId })
        }
        else {
            let record = invList.getRecord(productId);
            if (!empty(record)) {
                if (!record.perpetual && record.getATS().value < threshold && record.getATS().value != 0) {
                    requestProducts.push({ productId: productId, lineId: lineId, invListID: invList.ID === SiteInvList ? null : invList.ID });
                    backupData.push({ productId: productId, qty: record.perpetual ? 9999 : record.getATS().value, lineId: lineId })
                }
                else {
                    productQuantities.push({ productId: productId, qty: record.perpetual ? 9999 : record.getATS().value, lineId: lineId })
                }
            }
            else {
                productQuantities.push({ productId: productId, qty: 0, lineId: lineId })
            }
        }
    }
}

/**
 * Get inventory values for the passed in product and store ids.
 * @function getInventoryForProducts
 * @memberof Inventory
 * @param {[String]} products - product Ids
 * @param {[String]} storeIds - the store ids
 * @return {[Object]} - { productId: productId, lineId: lineId , invListID :"productId_(STH|ISPU)_inventoryListID" }
 */
function getInventoryForProducts(products, storeIds) {
    let productQuantities = [];
    let requestProducts = [];
    let externalProducts = [];
    let backupData = [];
    let webInvList = ProductInventoryMgr.getInventoryList();
    let storesObjects = [];
    if (!empty(storeIds)) {
        storesObjects = storeIds.map(storeId => {
            let store = StoreMgr.getStore(storeId);
            let storeInvList = BopisInvLimits.getStoreInventoryList(store);
            if (!empty(store) && !empty(storeInvList)) {
                return { storeId, storeInvList: storeInvList}
            }
        })
    }
    products.forEach(productId => {
        handleProduct(productId, productQuantities, requestProducts, backupData, webInvList, "STH", webThreshold);
        storesObjects.forEach(storeObj => {
            if (!empty(storeObj)) {
                handleProduct(productId, productQuantities, requestProducts, backupData, storeObj.storeInvList, "ISPU_" + storeObj.storeInvList.ID, storeThreshold);
            }
        })
    });
    if (!empty(requestProducts)) {
        if (Site.getCustomPreferenceValue('UseMAOForInventory')) {
            // Inline so if the cartridge is not present it does not error the whole file
            const MAOInventory = require('int_mao_composable/cartridge/scripts/getInventoryHelper.js');
            let data = MAOInventory.getInventoryArrayProducts(requestProducts, backupData, productQuantities);
            externalProducts = data.externalProducts;
            productQuantities = data.productQuantities;
        } else {
            externalProducts = RomsInventory.getInventoryArrayProducts(requestProducts);
            productQuantities = empty(externalProducts) ? productQuantities.concat(backupData) : productQuantities.concat(externalProducts);
        }
    }
    if (Site.getCustomPreferenceValue('OverwriteSFCCInventory') && !empty(externalProducts)) {
        ZeroSFInv(externalProducts, backupData, !empty(webInvList) ? webInvList.ID : '');
    }
    return productQuantities;
}

/**
 * Get external inventory values for the passed in product and inventoryIds.
 * @function getInventoryForProductsBasedOnInvIds
 * @memberof Inventory
 * @param {[String]} products - product Ids
 * @param {[String]} invIds - inventory list ids (Bopis only)
 * @return {[Object]} - Returns the returned formated values from radial { productId , qty , lineId }
 */
function getInventoryForProductsBasedOnInvIds(products, invIds) {
    let requestProducts = [];
    products.forEach(productId => {
        invIds.forEach(invId => {
            if (!empty(invId)) {
                let lineId = productId + "_" + invId;
                requestProducts.push({ productId: productId, lineId: lineId, invListID: invId });
            }
        })
    });
    let externalProducts = [];
    if (Site.getCustomPreferenceValue('UseMAOForInventory')) {
        // Inline so if the cartridge is not present it does not error the whole file
        const MAOInventory = require('int_mao_composable/cartridge/scripts/getInventoryHelper.js');
        let data = MAOInventory.getInventoryArrayProducts(requestProducts, [], []);
        externalProducts = data.externalProducts;
    } else {
        externalProducts = RomsInventory.getInventoryArrayProducts(requestProducts);
    }
    return externalProducts;
}

/**
 * Zeros inventory in sfcc for the specified product if sfcc !=0 but radial returned 0
 * @function ZeroSFInv
 * @memberof Inventory
 * @param {[Object]} externalProducts - { productId: productId, lineId: lineId , invListID :"productId_(STH|ISPU)_inventoryListID" }
 * @param {[Object]} externalProducts - { productId: productId, lineId: lineId , invListID :"productId_(STH|ISPU)_inventoryListID" }
 * @param {String} webInvListId - The list Id to 0
 */
function ZeroSFInv(externalProducts, sfccValues, webInvListId) {
    let productsToZero = externalProducts.filter(e => {
        let sfccValue = sfccValues.find(f => f.lineId === e.lineId);
        return e.qty == 0 && !empty(sfccValue) && sfccValue.qty > 0
    }
    );
    if (!empty(productsToZero)) {
        let authRes = Ocapi.GetOAuthInv.call();
        if (!authRes.error && !empty(authRes.object) && !empty(authRes.object.access_token)) {
            productsToZero.forEach(item => {
                let invListId = item.lineId.indexOf("ISPU") !== -1 ? item.lineId.split('_')[2] : webInvListId;
                Ocapi.PatchInventory.call({
                    'access_token': authRes.object.access_token,
                    'host': Site.httpsHostName,
                    'inventory_list_id': invListId,
                    'pid': item.productId
                });
            });
        }

    }
}

/**
 * Gets web and BOPIS inventory for one or more products directly from SFCC inventory lists,
 * without making any external service calls.
 * @function getInventoryForProductNOServiceCall
 * @memberof Inventory
 * @param {String|[String]} productIds - A single product ID or array of product IDs
 * @param {String} storeID - The store ID to look up BOPIS inventory for (optional)
 * @return {Object} - { [productId]: { webInv: Number, bopisInv: Number } }
 */
function getInventoryForProductNOServiceCall(productIds, storeID) {
    let ids = Array.isArray(productIds) ? productIds : [productIds];
    let webInvList = ProductInventoryMgr.getInventoryList();
    let store = !empty(storeID) ? StoreMgr.getStore(storeID) : null;
    let isStoreAvailable = !empty(store) && BopisInvLimits.isBopisStoreAvailable(store);
    let storeInvList = isStoreAvailable ? BopisInvLimits.getStoreInventoryList(store) : null;

    var result = {};

    ids.forEach(function (productId) {
        if (!empty(productId)) {
            var webInv = 0;
            var bopisInv = 0;

            var product = ProductHelper.getProductAttributesUsingCache(productId);

            // Web inventory
            if (!empty(webInvList)) {
                if (product.forceSoldOut && product.forceSoldOut.isForceSoldOut) {
                    webInv = 0;
                } else {
                    var webRecord = webInvList.getRecord(productId);
                    if (!empty(webRecord)) {
                        webInv = webRecord.perpetual ? 9999 : webRecord.getATS().value;
                    }
                }
            }

            // BOPIS inventory
            if (!empty(storeInvList)) {
                if (!BopisTurnedOn || empty(product.custom.availableForInStorePickup) || !product.custom.availableForInStorePickup) {
                    bopisInv = 0;
                } else {
                    var storeRecord = storeInvList.getRecord(productId);
                    if (!empty(storeRecord)) {
                        bopisInv = storeRecord.perpetual ? 9999 : storeRecord.getATS().value;
                    }
                }
            }

            result[productId] = { webInv: webInv, bopisInv: bopisInv };
        }
    });

    return result;
}

module.exports = {
    getInventoryForBasket,
    getInventoryForProducts,
    getInventoryForProductsBasedOnInvIds,
    getInventoryForProductNOServiceCall
}
