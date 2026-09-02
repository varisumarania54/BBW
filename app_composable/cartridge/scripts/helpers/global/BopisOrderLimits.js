/**
 * @namespace BopisOrderLimits
 */

'use strict';
const CustomObjectMgr = require('dw/object/CustomObjectMgr');
const Site = require('dw/system/Site').getCurrent();
const StoreMgr = require('dw/catalog/StoreMgr');
const ProductInventoryMgr = require('dw/catalog/ProductInventoryMgr');
const CacheMgr = require('dw/system/CacheMgr');


const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;

const performanceMode = Site.getCustomPreferenceValue('BopisOrderLimitsPerformanceMode');
const disabledBopisStores = getBopisOrderLimitsDisabledStoreList();
const nativeStoreInventoryListenabled = Site.getCustomPreferenceValue('enableNativeStoreInventoryList');

/**
* Returns Custom Object if it exists, if not it returns null
* @function getBopisStoreLimits
* @param {string} storeId : store id to search for in custom objects
* @returns {object|null} If the custom object search is successful returns custom object
* @memberof BopisOrderLimits
*/
function getBopisStoreLimits(storeId) {
    return CustomObjectMgr.getCustomObject('BopisStores', storeId);
}

/**
* Returns list of all bopis stores that have been disabled
* @function getBopisOrderLimitsDisabledStoreList()
* @returns {object|null}
* @memberof BopisOrderLimits
*/
function getBopisOrderLimitsDisabledStoreList() {
    let storeIDs = null;
    if (performanceMode) {
        try {
            const cache = CacheMgr.getCache("disabledBopisStoreIDs");
            let cachedStoreIDs = cache.get('storeIDs');
            if (cachedStoreIDs) {
                storeIDs = cachedStoreIDs;
            } else {
                let disabledBopisStoresLocal = CustomObjectMgr.getCustomObject('BopisOrderLimitsDisabledStoreList', 'BBW');
                if (empty(disabledBopisStoresLocal)) {
                    cache.put('storeIDs', null);
                    logHandler.logger.error({ message: 'Custom object type "BopisOrderLimitsDisabledStoreList" with id "BBW" does not exist.' }, 'Hooks', 'BopisOrderLimits');
                } else {
                    storeIDs = !empty(disabledBopisStoresLocal.custom.storeIDsCSV) ? disabledBopisStoresLocal.custom.storeIDsCSV.split(',') : [];
                    cache.put('storeIDs', storeIDs);
                }
            }
        } catch (error) {
            logHandler.logger.error(error, 'Hooks', 'BopisOrderLimits');
        }
    }
    return storeIDs;
}

/**
 * Returns a boolean depicting if a Bopis Store is available/unavailable based on business logic
 * @function isBopisStoreAvailable
 * @param {object|string} storeInfo : The store id or store object
 * @returns {boolean} true/false : Helps other logic know if a store is available/unavailable
 * @memberof BopisOrderLimits
*/
function isBopisStoreAvailable(storeInfo) {
    const enableStoreInventoryList = Site.getCustomPreferenceValue('enableNativeStoreInventoryList');
    const maoCheckEnabled = Site.getCustomPreferenceValue('MAOOrderLimitCheck');
    var Store;

    // BOPIS master off switch takes first priority to return false for all stores using this method
    if (empty(storeInfo) || Site.getCustomPreferenceValue('AllBopisStoresUnavailable') || !Site.getCustomPreferenceValue('enableStorePickUp')) {
        return false;
    }

    // If Store ID is passed as a string lookup Store and reassign
    if (typeof storeInfo == 'string') {
        const StoreMgr = require('dw/catalog/StoreMgr');
        Store = StoreMgr.getStore(storeInfo);
        if (Store == null) {
            logHandler.logger.error({ message: 'No store object available from StoreMgr' }, 'Hooks', 'BopisOrderLimits');
            return false;
        }
    } else if (storeInfo instanceof dw.catalog.Store) {
        Store = storeInfo;
    } else {
        logHandler.logger.error({ message: 'No store object available from Catalog' }, 'Hooks', 'BopisOrderLimits');
        return false;
    }

    // if the new MAO toggle is on, check the orderLimitHit flag on the store object
    if(maoCheckEnabled && 'orderLimitHit' in Store.custom && Store.custom.orderLimitHit === true) {
        return false;
    }

    // If Store is manually turned off return disabled
    let storeTurnedOff = ('turnBopisStoreOff' in Store.custom) ? Store.custom.turnBopisStoreOff : null;
    if (storeTurnedOff === true) {
        return false;
    }

    // If Store does not have InventoryListID Set therefore Store is Disabled
    let inventoryListId = enableStoreInventoryList ? Store.inventoryListID : Store.custom.inventoryListId;
    if (!inventoryListId) {
        return false;
    }

    // When performance mode is on check against chache list of disabled store ids
    if (performanceMode && disabledBopisStores) {
        return !disabledBopisStores.includes(Store.ID);
    }

    let bopisStoreCustomObj = getBopisStoreLimits(Store.ID);
    let limitReached = !empty(bopisStoreCustomObj) && 'bopisLimitReached' in bopisStoreCustomObj.custom ? bopisStoreCustomObj.custom.bopisLimitReached : null;
    if (limitReached === true) {
        return false;
    }

    // If none of the above conditions are met return store is available
    return true;
}

/**
 * Returns the purchase limit for a product using store/web inventory, category limit, and product limit.
 *
 * The lowest applicable limit is selected, and the result defaults to 0 when no limit value is resolved.
 * @function getPurchaseLimit
 * @param {dw.catalog.Product|null} product - Product to evaluate.
 * @param {string} [storeId] - Optional store ID; when provided, store inventory is used.
 * @returns {number} Purchase limit as an integer for valid product input, otherwise 0.
 * @memberof BopisOrderLimits
 */
function getPurchaseLimit(product, storeId) {
    if (!empty(product)) {
        // TODO: account for store limit in custom object
        const inventoryLimit = storeId != null ? getStoreInventoryLimit(product.ID, storeId) : getInventoryLimit(product);
        const catLimit = !empty(product.primaryCategory) ? getCategoryQtyLimit(product.primaryCategory.ID) : null;
        const productLimit = getProductQtyLimit(product);
        let purchaseLimit = !empty(catLimit) && catLimit < inventoryLimit ? catLimit : inventoryLimit;
        purchaseLimit = !empty(productLimit) && productLimit < purchaseLimit ? productLimit : purchaseLimit;

        purchaseLimit = purchaseLimit || 0;

        return parseInt(purchaseLimit);
    }
    return 0;
}

/**
 * Returns available inventory for requested product and store combination to be used as a limit.
 * @function getStoreInventoryLimit
 * @param {string} pid - product id
 * @param {string} storeId - store id
 * @returns {number|null} The lowest limit as a number, if a limit exists. Otherwise returns null.
 * @memberof BopisOrderLimits
 */
function getStoreInventoryLimit(pid, storeId) {
    const productHelper = require('app_composable/cartridge/scripts/helpers/objects/product.js');
    let productAvailabilityCount = 0;

    // Check to see if store is enabled and available, then adds product availability. Otherwise, store is NOT available and returns 0.
    if (isBopisStoreAvailable(storeId) && productHelper.checkProductBopisEnabled(pid)) {
        const Store = StoreMgr.getStore(storeId);
        if (Store === null) {
            return productAvailabilityCount;
        }
        const storeinventory = getStoreInventoryList(Store);
        if (storeinventory) {
            if (storeinventory.getRecord(pid)) {
                productAvailabilityCount = storeinventory.getRecord(pid).ATS.value;
            }
        }
    } else {
        return productAvailabilityCount;
    }

    return productAvailabilityCount;
}
/**
 * Returns inventoryList for that store
 * @function getStoreInventoryList
 * @param {Object|String} storeInput - dw.catalog.Store, plain objects with ID, or string ID
 * @returns {Object} inventoryList
 * @memberof BopisOrderLimits
 */
function getStoreInventoryList(storeInput) {
    let inventoryList = null;
    // Return null if no storeInput provided
    if (empty(storeInput)) {
        return inventoryList;
    }
    // Resolve storeInput to dw.catalog.Store
    const store = storeInput instanceof dw.catalog.Store ? storeInput : StoreMgr.getStore(storeInput.ID || storeInput);
    if (store == null) return inventoryList;

    // Try native inventory list first if feature is on,
    // Otherwise fall back to store custom attribute: inventoryListId
    inventoryList = nativeStoreInventoryListenabled ? store.getInventoryList() : null;
    let customInventoryListId = store.custom.inventoryListId || null;
    if (!inventoryList && customInventoryListId) {
        inventoryList = ProductInventoryMgr.getInventoryList(customInventoryListId);
    }
    return inventoryList;
}
/**
 * Returns available web inventory for that product
 * @function getInventoryLimit
 * @param {Object} product - product object
 * @returns {Number} availableInventory - Number of available inventory
 * @memberof BopisOrderLimits
 */
function getInventoryLimit(product) {
    const availableInventory = !empty(product.availabilityModel.inventoryRecord) ? product.availabilityModel.inventoryRecord.ATS.value : 0
    return availableInventory;
}

/**
 * Get quantity value that can be purchased for each product in category in transaction
 * @function getCategoryQtyLimit
 * @param {string} id - String Category ID
 * @returns {num|null} num - Number or null if no limit has been set.
 * @memberof BopisOrderLimits
 */
function getCategoryQtyLimit(id) {
    if (empty(id)) {
        return null;
    }

    const cache = CacheMgr.getCache("categoryMaxOrderable");

    let categoryQtyLimit = cache.get(id);

    if (!empty(categoryQtyLimit)) {
        return categoryQtyLimit;
    } else {
        const category = dw.catalog.CatalogMgr.getCategory(id)
        let num = 10000;

        if (!empty(category) && 'maxOrderable' in category.custom && !empty(category.custom.maxOrderable)) {
            num = category.custom.maxOrderable;
        }

        cache.put(id, num);
        return num;
    }
}

/**
 * Get quantity value for product that can be purchased in single
 * transaction product-level value always should override category-level.
 * @function getProductQtyLimit
 * @param {Product} product - Product
 * @returns {num|null} - Number or null if no limit has been set.
 * @memberof BopisOrderLimits
 */
function getProductQtyLimit(product) {

    let num = 10000;

    if (!empty(product) && 'maxOrderable' in product.custom && !empty(product.custom.maxOrderable)) {
        num = product.custom.maxOrderable;
    }

    return num;
}

/**
 * Calculates and caches the per-store purchase limit for a product.
 *
 * Uses the provided product/store pair to compute the store-specific
 * purchase limit and stores it in the provided cache for reuse.
 *
 * @function setProductStoreAvailabilityUsingCache
 * @param {dw.catalog.Product|null} product - Product object to evaluate.
 * @param {string} storeId - Store ID used for limit calculation.
 * @param {dw.system.Cache} cache - Cache instance where the computed limit is stored.
 * @returns {number|null} Purchase limit for the product at the store, or null when unavailable.
 * @memberof BopisOrderLimits
 */
function setProductStoreAvailabilityUsingCache(product, storeId, cache) {
    
    let purchaseLimit = 0;

    if (!empty(product)) {

        if (product.online) {
            purchaseLimit = getPurchaseLimit(product, storeId);
        } 

        cache.put(product.ID, purchaseLimit);

        return purchaseLimit;
        
    } else {
        return 0;
    }
    
}

/**
 * Gets the cached per-store purchase limit for a product, computing and caching it on miss.
 *
 * Cache key format: {storeId}{productId} in the storeAvailabilitySCAPI cache.
 * When no cached value exists, the product is loaded and the limit is calculated
 * via setProductStoreAvailabilityUsingCache().
 *
 * @function getProductStorePurchaseLimitUsingCache
 * @param {string} productId - Product ID.
 * @param {string} storeId - Store ID.
 * @returns {number} Cached or computed purchase limit; returns 0 when input is invalid.
 * @memberof BopisOrderLimits
 */
function getProductStorePurchaseLimitUsingCache(productId, storeId) {
   
    let productObject;
   
    const cache = CacheMgr.getCache("storeAvailabilitySCAPI");
    let uniqueKey = storeId + productId;
    let cachedStoreAvailability = cache.get(uniqueKey);
    var purchaseLimit = 0;

    if (!empty(cachedStoreAvailability)) {
        purchaseLimit = cachedStoreAvailability;
    } else {
        
        productObject = dw.catalog.ProductMgr.getProduct(productId);

        purchaseLimit = setProductStoreAvailabilityUsingCache(productObject, storeId, cache) || 0;

    }

    return purchaseLimit;
    
}

/**
 * Get quantity value for product that can be purchased in single
 * transaction product-level value always should override category-level.
 * @function getProductStoreAvailabilityUsingCache
 * @param {product|string} product - Product object or product id
 * @param {store|string} store - Store object or store id
 * @param {dw.system.Cache} [cache] - Cache instance where the computed availability is stored.
 * @returns {bool} - True if product has available inventory at that store
 * @memberof BopisOrderLimits
 */
function getProductStoreAvailabilityUsingCache(product, store, cache) {
    const storeHelper = require('app_composable/cartridge/scripts/helpers/store/storeHelpers.js');

    //if store is a string
    let storeId;
    let productId;
    let storeObject;
    let productObject;
    
    if (typeof store === 'string') {
        storeId = store;
    } else {
        storeObject = storeHelper.getStoreType(store);
        if (!empty(storeObject)) {
            storeId = storeObject.ID;
        }
        
    }

    //if product is a string
    if (typeof product === 'string') {
        productId = product;
    } else {
        productObject = product instanceof dw.catalog.Product ? product : dw.catalog.ProductMgr.getProduct(product);
        if (!empty(productObject)) {
            productId = productObject.ID;
        }        
    }

    if (!empty(storeId) && !empty(productId)) {
        if (empty(cache)) {
            cache = CacheMgr.getCache("storeAvailabilitySCAPI");
        }
        let uniqueKey = storeId + productId;
        let cachedStoreAvailability = cache.get(uniqueKey);
        var available;
        if (!empty(cachedStoreAvailability)) {
            available = cachedStoreAvailability ? cachedStoreAvailability > 0 : false;
        } else {
         

            if (empty(productObject)) {
                productObject = product instanceof dw.catalog.Product ? product : dw.catalog.ProductMgr.getProduct(product);
            }

            let purchaseLimit = setProductStoreAvailabilityUsingCache(productObject, storeId, cache) || 0; 
            available = purchaseLimit ? purchaseLimit > 0 : false;
        }
        return available;
    } else {
        return false;
    }
}


module.exports = {
    getBopisStoreLimits,
    isBopisStoreAvailable,
    getPurchaseLimit,
    getStoreInventoryLimit,
    getInventoryLimit,
    getCategoryQtyLimit,
    getProductQtyLimit,
    getStoreInventoryList,
    getProductStoreAvailabilityUsingCache,
    getProductStorePurchaseLimitUsingCache
}
