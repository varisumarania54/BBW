/**
 * A namespace.
 * @namespace storeHelpers
 */
'use strict';

const Site = require('dw/system/Site').getCurrent();

const CacheMgr = require('dw/system/CacheMgr');
const StoreMgr = require('dw/catalog/StoreMgr');
const BasketMgr = require('dw/order/BasketMgr');

const BopisOrderLimits = require('app_composable/cartridge/scripts/helpers/global/BopisOrderLimits.js');
const ProductHelper = require('app_composable/cartridge/scripts/helpers/objects/product.js');
const InvService = require('app_composable/cartridge/scripts/helpers/integrations/inventory/ExternalInventory.js');
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;
const convertAttributeToJSON = require('app_composable/cartridge/scripts/helpers/objects/attributes').convertAttributeToJSON;

/**
 * Processes BOPIS (Buy Online, Pick Up In Store) related logic for stores.
 * @param {Object} doc - The document containing store data.
 * @param {Object} c_productId - The product ID parameter from the request.
 * @param {Array} storeInventoryIds - Array to collect inventory list IDs.
 */
function handleBOPIS(doc, c_productId, storeInventoryIds) {
    // Filter stores that have inventory list IDs and then check if eligible for radial
    if (c_productId.submitted) {
        doc.data = doc.data.toArray().filter(store => store.c_inventoryListId).map(store => processStoreForBOPIS(store, c_productId, storeInventoryIds));
    } else {
        doc.data = doc.data.toArray().filter(store => store.c_inventoryListId);
    }

    // call radial for eligible stores
    if (c_productId.submitted && storeInventoryIds.length > 0 && Site.getCustomPreferenceValue('bopisRadialCheck')) {
        radialInventoryCheck(doc, c_productId, storeInventoryIds);
    }

    doc.total = doc.data.length;
}


/**
 * Processes individual stores to determine BOPIS availability.
 * @param {store} store - The store object to process.
 * @param {product} c_productId - The product ID parameter from the request.
 * @param {Array} storeInventoryIds - Array to collect inventory list IDs.
 * @returns {Object} The processed store object.
 */
function processStoreForBOPIS(store, c_productId, storeInventoryIds) {
    let product;

     // get product if we have a product id
    if (!empty(c_productId) && c_productId.submitted) {
        product = dw.catalog.ProductMgr.getProduct(c_productId.value);
    } else {
        let errorMessage = "processStoreForBopis function was used but c_productId was not set";
        logHandler.logger.error({message: errorMessage}, 'Helper', 'Store');
        return store;
    }

    // does the store have bopis
    let isBopisStoreAvailable = !empty(store) ? BopisOrderLimits.isBopisStoreAvailable(store.id) : false;
    
    if (isBopisStoreAvailable && (empty(store.c_turnBopisStoreOff) || !store.c_turnBopisStoreOff) && !empty(product)) {
        const inventoryList = BopisOrderLimits.getStoreInventoryList(store);
        if (inventoryList) {
           
            // get purchase limits for the product based on the store
            const productLimit = BopisOrderLimits.getPurchaseLimit(product, store.id);
            
            // set if it exists
            if (productLimit) {
                store.c_bopis_purchase_limit = productLimit;
            }

            store.c_bopis_productId_available = BopisOrderLimits.getProductStoreAvailabilityUsingCache(product, store);

            // push stores that qualify
            if (!store.c_bopis_productId_available) {
                storeInventoryIds.push(store.c_inventoryListId);
            }
        } else {
            let errorMessage;
            if (empty(store.c_inventoryListId)) {
                errorMessage = "There is no BOPIS inventory list set for Store ID " + store.id;
            } else {
                errorMessage = "There is no BOPIS inventory list for Store ID " + store.id + " that has an inventory list id of " + store.c_inventoryListId;
            }
            
            logHandler.logger.error({message: errorMessage}, 'Helper', 'Store');
            store.c_bopis_productId_available = false;
        }
    } else if (c_productId.submitted) {
        store.c_bopis_productId_available = false;
    }
    return store;
}

/**
 * Updates the availability status of stores based on inventory quantities.
 * @param {Object} doc - The document containing store data.
 * @param {productid} c_productId - The product ID parameter from the request.
 * @param {Array} storeInventoryIds - Array of inventory list IDs to check.
 */
function radialInventoryCheck(doc, c_productId, storeInventoryIds) {
    try {
        let bopisEligible = ProductHelper.checkProductBopisEnabled(c_productId);
        if (bopisEligible) {
            let data = InvService.getInventoryForProductsBasedOnInvIds([c_productId.value], storeInventoryIds)
            if (!empty(data)) {
                doc.data.toArray().forEach(store => {
                    let entry = data.find(e=>e.lineId.split('_')[1] === store.c_inventoryListId);
                    if(!empty(entry)){
                        store.c_bopis_productId_available = entry.qty > 0;
                    }
                });
            }
        }
        
    } catch (e) {
        logHandler.logger.error(e, 'Hooks', 'radial');
    }
}


/**
 * Filters stores based on the specified store types.
 * @param {Object} doc - The document containing store data.
 * @param {string} c_storeType - The store type parameter from the request.
 */
function filterByStoreType(doc, c_storeType) {
    const storeTypes = c_storeType.toUpperCase().split(',');
    doc.data = doc.data.toArray().filter(store => storeTypes.some(type => store.c_storeType.includes(type)));
    doc.total = doc.data.length;
}

/**
 * Sets the address details of the given `toAddress` object based on the provided store information.
 *
 * @param {Object} toAddress - The address object where the store details will be populated.
 * @param {Object|string} store - The store object or store identifier (as a string) to retrieve the address information.
 * @return {boolean} Returns true if the address details were successfully set; otherwise, returns false.
 */
function setStoreAddress(toAddress, store){


    const storeObject = typeof store == 'string' ? getStoreAttributesUsingCache(store) : store;
    if (!toAddress || !storeObject) {
        return false;
    }

    toAddress.setFirstName(storeObject.name);
    toAddress.setLastName(' ');
    toAddress.setAddress1(storeObject.address1);
    toAddress.setAddress2(storeObject.address2);
    toAddress.setCity(storeObject.city);
    toAddress.setPostalCode(storeObject.postalCode);
    toAddress.setStateCode(storeObject.stateCode);
    toAddress.setCountryCode(storeObject.countryCode);
    toAddress.setPhone(storeObject.phone);

    return true;
}

/**
 * Find store based on hirearchy if Basket.custom.preferredStore not found then check
 * customer.profile.custom.preferredStore
 * if neiter found then return null
 *
 * @returns {String | Null} storeId if one is found
 */
function findPreferredStore() {
    let storeId = null;
    // if signed in then set their store on profile
    if (customer.isRegistered() && customer.profile.custom.preferredStore) {
        storeId = customer.profile.custom.preferredStore;
    }
    let basket = BasketMgr.getCurrentBasket();
    if (basket && basket.custom.preferredStore) {
        storeId = basket.custom.preferredStore;
    }
    return storeId;
}

/**
 * Set Store address with store address provided
 * @function mapStore
 * @memberof storeHelpers
 * @param {Store} store - store object
 * @param {Object} store - new store mapped into an object
 */
function mapStore(store) {
    const enableStoreInventoryList = Site.getCustomPreferenceValue('enableNativeStoreInventoryList');
    return {
        address1: store.address1 ? store.address1 : null,
        address2: store.address2 ? store.address2 : null,
        city: store.city ? store.city : null,
        stateCode: store.stateCode ? store.stateCode : null,
        postalCode: store.postalCode ? store.postalCode : null,
        countryCode: store.countryCode.value ? store.countryCode.value : null,
        c_inventoryListId: enableStoreInventoryList ? store.inventoryListID : store.custom.inventoryListId,
        c_storeType: store.custom.storeType.length > 0 && store.custom.storeType[0].value ? store.custom.storeType[0].value : null,
        latitude: store.latitude ? store.latitude : null,
        longitude: store.longitude ? store.longitude : null,
        phone: store.phone ? store.phone : null,
        posEnabled: store.posEnabled ? store.posEnabled : null,
        storeEvents: store.storeEvents && store.storeEvents.markup ? store.storeEvents.markup : null,
        id: store.ID ? store.ID : null,
        storeLocatorEnabled: store.storeLocatorEnabled ? store.storeLocatorEnabled : null,
        storeHours: store.storeHours && store.storeHours.markup ? store.storeHours.markup : null,
        name: store.name ? store.name : null,
    };
}


/**
 * Set Store address with store address provided
 * @function getStoreType
 * @memberof storeHelpers
 * @param {store|object|string} store - store type, store object from doc, or store id
 * @param {store} store - return store type
 */
function getStoreType(store) {
    return store instanceof dw.catalog.Store ? store : (typeof store === 'object' ? StoreMgr.getStore(store.ID) : StoreMgr.getStore(store));
}


/**
 * Get attributes for a store using cache to reduce database calls.
 * @function getStoreAttributesUsingCache
 * @param {string} storeId - Store object or store id
 * @returns {object} - JSON object with requested attributes
 * @memberof ProductHelpers
 */
function getStoreAttributesUsingCache(storeId) {

    var response = {};

    if (!empty(storeId)) {
        const bannedAttributes = [
            "custom.turnBopisStoreOff"
        ];
        const storeAttributesToSave = [
            "name",
            "address1",
            "address2",
            "city",
            "postalCode",
            "stateCode",
            "countryCode",
            "phone",
            "latitude",
            "longitude",
            "storeHours",
            "inventoryListID"
        ]

        let storeCacheEnabled = Site.getCustomPreferenceValue('enableStoreCustomCache');

        let cache;
        let cachedStoreAttributes;

        if (storeCacheEnabled) {
            cache = CacheMgr.getCache("storeAttributeCache");
            cachedStoreAttributes = cache.get(storeId);
        }  

        const bannedAttributeExist = bannedAttributes.some(value => storeAttributesToSave.includes(value));
        if (bannedAttributeExist) {
            logHandler.logger.error({ message: 'Banned store attribute exist in store custom cache' }, 'Helpers', 'store');
            return;
        }

        if (!empty(cachedStoreAttributes)) {
            response = cachedStoreAttributes;
        } else {
            const store = StoreMgr.getStore(storeId);
            if (!empty(store)) {
                let storeAttributesGoingIntoCache = {};
                storeAttributesGoingIntoCache.custom = {};
                for (let i = 0; i < storeAttributesToSave.length; i++) {
                    var custom = false;
                    var attribute = storeAttributesToSave[i];
                    if (storeAttributesToSave[i].includes('custom.')) {
                        custom = true;
                        attribute = storeAttributesToSave[i].replace('custom.', '');
                    }

                    let storeAttribute;

                    if (custom) {
                        storeAttribute = convertAttributeToJSON(store.custom[attribute]);
                        storeAttributesGoingIntoCache['custom'][attribute] = storeAttribute;
                    } else {
                        storeAttribute = convertAttributeToJSON(store[attribute]);
                        storeAttributesGoingIntoCache[attribute] = storeAttribute;
                    }
                }


                if (!empty(cache)) {
                    cache.put(storeId, storeAttributesGoingIntoCache);
                }

                response = storeAttributesGoingIntoCache;
            }
        }
        return response;
    } else {
        logHandler.logger.error({ message: 'getStoreAttributesUsingCache function needs proper parameters' }, 'Helpers', 'store');
        return response;
    }
}

/**
 * Retrieves BOPIS store availability data from cache, populating it if not already cached.
 * Uses the store's ID as the cache key and stores availability status and inventory list ID.
 * @function getStoreAvailableCache
 * @param {dw.catalog.Store|string} storeInfo - Store object or store ID string
 * @returns {boolean} - Boolean indicating if the store is available for BOPIS
 * @memberof storeHelpers
 */
function getStoreAvailableCache(storeInfo) {
    const cache = CacheMgr.getCache("storeLevelAvailability");
    let uniqueKey;
    let cachedStoreAvailability;
    let isBopisStoreAvailable = false;

    if (typeof storeInfo === 'string'){
        uniqueKey = storeInfo;
        cachedStoreAvailability = cache.get(uniqueKey);
        if (cachedStoreAvailability) {
            isBopisStoreAvailable = cachedStoreAvailability;
        }
    }    
    
    if (empty(cachedStoreAvailability)) {
        let storeObject = getStoreType(storeInfo);
        if (storeObject) {
            uniqueKey = storeObject.ID;
            cachedStoreAvailability = cache.get(uniqueKey);
            
            if (!empty(cachedStoreAvailability)) {
                isBopisStoreAvailable = cachedStoreAvailability;
            } else {
                isBopisStoreAvailable = BopisOrderLimits.isBopisStoreAvailable(storeObject);
                cache.put(uniqueKey, isBopisStoreAvailable);
            }
        } else {
            if (typeof storeInfo === 'string'){
                logHandler.logger.error({ message: 'No store object with id ' + storeInfo + ' exists' }, 'Hooks', 'BopisOrderLimits');
            } else {
                logHandler.logger.error({ message: 'No store object found' }, 'Hooks', 'BopisOrderLimits');
            }
        }
    }
    return isBopisStoreAvailable;
}

module.exports = {
    handleBOPIS,
    processStoreForBOPIS,
    radialInventoryCheck,
    filterByStoreType,
    setStoreAddress,
    findPreferredStore,
    mapStore,
    getStoreType,
    getStoreAttributesUsingCache,
    getStoreAvailableCache
}
