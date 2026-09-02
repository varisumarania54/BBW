'use strict';
importPackage(dw.system);

const StoreMgr = require('dw/catalog/StoreMgr');
const ProductInventoryMgr = require('dw/catalog/ProductInventoryMgr');
const PromotionMgr = require('dw/campaign/PromotionMgr');
const Site = require('dw/system/Site');
const ProductMgr = require('dw/catalog/ProductMgr');
const CacheMgr = require('dw/system/CacheMgr');
const URLUtils = require('dw/web/URLUtils');

const BopisOrderLimits = require('app_composable/cartridge/scripts/helpers/global/BopisOrderLimits.js');
const convertAttributeToJSON = require('app_composable/cartridge/scripts/helpers/objects/attributes.js').convertAttributeToJSON;
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;
const ForceSoldOutHelper = require('app_composable/cartridge/scripts/helpers/global/ForceSoldOutHelper.js');

/**
 * These functions are used for getting information about a product.
 * @namespace ProductHelpers
 */

/**
 * Gets product name to display based on business rules.
 * @function getProductName
 * @param {Object} product - product object we want name for
 * @returns {string} Returns name of the product
 * @memberof ProductHelpers
 */
function getProductName(product) {
    if (product && ('fragranceName' in product.custom) && !empty(product.custom.fragranceName)) {
        return product.custom.fragranceName;
    }
    if (product && ('descriptiveName' in product.custom) && !empty(product.custom.descriptiveName)) {
        return product.custom.descriptiveName;
    }
    return product.name;
}

/**
 * Returns product name translation required.
 * @function productNameTranslationRequired
 * @param {Object} product - product object we want for
 * @returns {boolean} Returns translation required or not
 * @memberof ProductHelpers
 */
function productNameTranslationRequired(product) {
    return !(product && 'fragranceName' in product.custom && !empty(product.custom.fragranceName));
}
/**
 * Gets the value of an attribute or returns null.
 *
 * @function checkForCustomAttribute
 * @param {Object} product - product object
 * @param {string} attribute - attribute id within custom to look for
 * @returns {Object|null} The value of the attribute or null
 * @memberof ProductHelpers
 */
function checkForCustomAttribute(product, attribute) {
    if (!empty(product) && !empty(product.custom) && attribute in product.custom && !empty(product.custom[attribute])) {
        return product.custom[attribute]
    }
    return null;
}

/**
 * Gets the value of an attribute or returns false.
 * @function getValueForCustomAttributeBool
 * @param {Object} product - object
 * @param {string} attribute - attribute id within custom to look for
 * @returns {Object|Boolean} The value of the attribute or false if it doesn't exsist or isn't set
 * @memberof ProductHelpers
 */
function getValueForCustomAttributeBool(product, attribute) {
    const value = checkForCustomAttribute(product, attribute);
    return !empty(value) ? value : false;
}

/**
 * Checks a products availability on SFCC only. Returns web availability by default and store availability if a store id is passed in.
 * Note: Force Sold Out functionality impacts web availability only.
 * @function hasSFCCInventory
 * @param {Object} product - product object
 * @param {string} [storeID] - store id value
 * @returns {Boolean} Returns a boolean based on whether product is available or not.
 * @memberof ProductHelpers
 */
function hasSFCCInventory(product, storeID) {
    if (!empty(storeID)) {
        const availabilityObject = getSFCCAvailability(product, storeID);
        return availabilityObject.storeInv > 0;
    } else {
        if (empty(product) || !product.online) {
            return false;
        } else if (!Site.getCurrent().getCustomPreferenceValue('enableForceSoldOutCheck')) {
            // enableForceSoldOutCheck is OFF, check inventory availability.
            return getWebInventory(product) > 0;
        } else {
            const currentDate = new Date();
            // enableForceSoldOutCheck is ON, see if current date is before end date, if true, run Force Sold Out Check.
            if (product.custom.forceSoldOutEndTime && (currentDate < product.custom.forceSoldOutEndTime)) {

                return ForceSoldOutHelper.isMarkedAsSoldOutProduct(product) ? false : getWebInventory(product) > 0;
            } else {
                // enableForceSoldOutCheck is ON and current date is after FSO end date, check inventory for availability.
                return getWebInventory(product) > 0;
            }
        }
    }
}

/**
 * Returns a number of the products web inventory value.
 *
 * @function getWebInventory
 * @param {Object} product - product object
 * @returns {number}  Number value of products web inventory
 * @memberof ProductHelpers
 */
function getWebInventory(product) {
    const webInvRecord = product.getAvailabilityModel().getInventoryRecord();

    if (!empty(webInvRecord)) {
        if (webInvRecord.perpetual) {
            return 9999;
        } else {
            return webInvRecord.getATS().value;
        }
    } else {
        return 0;
    }
}

/**
 * Returns a number of the products store inventory value.
 *
 * @function getStoreInventory
 * @param {Object} product - product object
 * @param {string|Store|null} store - store id
 * @returns {number} Number value of products store inventory
 * @memberof ProductHelpers
 */
function getStoreInventory(product, store) {
    const getStoreInventoryList = require('app_composable/cartridge/scripts/helpers/global/BopisOrderLimits.js').getStoreInventoryList;
    const storeObj = typeof store === 'object' ? store : StoreMgr.getStore(store);
    let bopisInvRecord;
    let storeInventoryRecord = 0;
    if (!empty(storeObj)) {
        
        const inventoryList = getStoreInventoryList(storeObj);
        if (!empty(inventoryList)) {
            bopisInvRecord = inventoryList.getRecord(product.ID);
        }
        if (!empty(bopisInvRecord) && product.custom.availableForInStorePickup) {
            storeInventoryRecord = bopisInvRecord.getATS().value;
        }
    }
    return storeInventoryRecord;
}

/**
 * Returns an object with the store inventory and the web inventory
 *
 * @function getSFCCAvailability
 * @param {Object} product - product object
 * @param {string} [storeID] - store id param
 * @returns {Object} Inventory values object. invObj: {storeInv: Number, webInv: Number}
 * @memberof ProductHelpers
 */
function getSFCCAvailability(product, storeID) {

    let invObj = {
        webInv: 0,
        storeInv: 0
    }
    if (empty(product) || !product.online) {
        return invObj;
    }

    if (!ForceSoldOutHelper.isMarkedAsSoldOutProduct(product)) {
        invObj.webInv = getWebInventory(product);
    }

    if (storeID) {
        invObj.storeInv = getStoreInventory(product, storeID);
    }

    return invObj;
}

/**
 * Returns the base list price of a product
 *
 * @function getProductStandardPrice
 * @param {Object} product - product list item
 * @returns {number} Value of the products list pricebook price
 * @memberof ProductHelpers
 */
function getProductStandardPrice(product) {
    let listPrice = dw.value.Money.NOT_AVAILABLE,
        PriceModel = product.priceModel;

    if (!empty(PriceModel)) {
        if (!PriceModel.getPrice().available) {
            listPrice = dw.value.Money.NOT_AVAILABLE;
        } else {
            let priceBook = PriceModel.priceInfo.priceBook;

            while (priceBook.parentPriceBook) {
                priceBook = priceBook.parentPriceBook ? priceBook.parentPriceBook : priceBook;
            }

            listPrice = PriceModel.getPriceBookPrice(priceBook.ID);
        }
    }

    return listPrice.valueOrNull ? listPrice.value.toFixed(2) : listPrice.valueOrNull;
}


/**
 * Returns the lowest price promotion without qualifying coupon or null
 *
 * @function getProductSalePrice
 * @param {Object} product - product list item
 * @returns {number|null} Value of the product without qualifying coupon or null
 * @memberof ProductHelpers
 */
function getProductSalePrice(product) {
    const enableXccStrikethroughPricing = Site.getCurrent().getCustomPreferenceValue('enableXccStrikethroughPricing');

    if (enableXccStrikethroughPricing) {
        const promos = PromotionMgr.activeCustomerPromotions.getProductPromotions(product) || [];
        if (promos && promos.length > 0) {
            let salePrice = dw.value.Money.NOT_AVAILABLE;
            // first non coupon promo returned is lowest price.
            const nonCouponPromo = promos.toArray().find(e => { return e && !e.basedOnCoupons });
            if (nonCouponPromo) {
                salePrice = nonCouponPromo.getPromotionalPrice(product);
            }
            return salePrice.valueOrNull ? salePrice.value.toFixed(2) : salePrice.valueOrNull;
        } else {
            // no promos found so dont return a sale price.
            return null;
        }
    } else {
        // use pricebook pricing.
        return product.priceModel.price.valueOrNull ? product.priceModel.price.value.toFixed(2) : product.priceModel.price.valueOrNull;

    }
}

/**
 * Returns true or false based on Everyone customer group or null
 *
 * @function getProductSalePrice
 * @param {Object} customerGroups - Groups of customer
 * @returns {boolean} Returns true or false based on Everyone customer group
 */
function getCustomerGroupContainsEveryone(customerGroups) {
    const customerGroupsArray = customerGroups.toArray();
    return !empty(customerGroupsArray) && customerGroupsArray.some(e => e.ID === 'Everyone');
}

/**
 * Returns products sales price without customer
 *
 * @function getProductSalePriceWithoutCustomer
 * @param {Object} product - product list item
 * @returns {number|null} Value of the product without qualifying coupon or null and without customer
 * @memberof ProductHelpers
 */
function getProductSalePriceWithoutCustomer(product) {
    const enableXccStrikethroughPricing = Site.getCurrent().getCustomPreferenceValue('enableXccStrikethroughPricing');

    if (enableXccStrikethroughPricing) {
        const promos = PromotionMgr.getActivePromotions().getProductPromotions(product) || [];
        if (promos && promos.length > 0) {
            let salePrice = dw.value.Money.NOT_AVAILABLE;
            // first non coupon promo returned is lowest price.
            const nonCouponPromo = promos.toArray().find(e => { return e && !e.basedOnCoupons && getCustomerGroupContainsEveryone(e.customerGroups) });
            if (nonCouponPromo) {
                salePrice = nonCouponPromo.getPromotionalPrice(product);
            }
            return salePrice.valueOrNull ? salePrice.value.toFixed(2) : salePrice.valueOrNull;
        } else {
            // no promos found so dont return a sale price.
            return null;
        }
    } else {
        // use pricebook pricing.
        return product.priceModel.price.valueOrNull ? product.priceModel.price.value.toFixed(2) : product.priceModel.price.valueOrNull;

    }
}

/**
* Returns a boolean whether a product is available in store.
*
* @function isProductAvailableInStore
* @param {Object} product - full product object
* @param {string|null} storeID - store id
* @returns {boolean} Boolean representing product availability in store.
* @memberof ProductSearchHelpers
*/
function isProductAvailableInStore(product, storeID) {
    const store = !empty(storeID) ? StoreMgr.getStore(storeID) : null;
    const getStoreInventoryList = require('app_composable/cartridge/scripts/helpers/global/BopisOrderLimits.js').getStoreInventoryList;
    
    let bopisInvRecord;
    let storeInventoryRecord = 0;

    if (!empty(store)) {
        const inventoryList = getStoreInventoryList(store);
        if (!empty(inventoryList)) {
            bopisInvRecord = inventoryList.getRecord(product.ID);
        }
        if (!empty(bopisInvRecord) && product.custom.availableForInStorePickup) {
            storeInventoryRecord = bopisInvRecord.getATS().value;
        }
    }

    return storeInventoryRecord > 0;
}
/**
 * filter slot configurations based on product id and banner campaign
 *
 * @function getProductBanner
 * @param {Object} slotConfigs - slot configurations
 * @param {string} productId - product id
 * @returns {object} product configurations
 * @memberof ProductHelpers
 */
function getProductBanner(slotConfigs, productId) {
    const product = getProductAttributesUsingCache(productId);
    let productSlotConfigs = [];
    let nonProductSlotConfigs = [];
    let productInfo;

    if (product && product.custom.PDPBannerCampaignID) {

        productInfo = product.custom.PDPBannerCampaignID.split(',');

    } else {
        return slotConfigs;
    }
    if (slotConfigs) {
        productSlotConfigs = slotConfigs.filter(function (config) {

            let bannerCampaign = config.configuration_id.split('|')
            let bannerCampaignName = bannerCampaign[0];
            let bannerCampaignId = bannerCampaign[1];

            if (bannerCampaignName === 'PDP-Banner-Campaign-ID' && productInfo.includes(bannerCampaignId)) {
                return true;
            }
            else if (bannerCampaignName === 'PDP-Banner-Campaign-ID' && !productInfo.includes(bannerCampaignId)) {
                return false;
            }
            nonProductSlotConfigs.push(config)
        })
    }
    return productSlotConfigs.length > 0 ? productSlotConfigs : nonProductSlotConfigs;
}

/**
 * return product data based list of product ids
 *
 * @function getProductContent
 * @param {array} product_ids - product id
 * @returns {object} product configurations
 * @memberof ProductHelpers
 */
function getProductContent(product_ids) {

    let params = [];
    let siteId = dw.system.Site.getCurrent().getID();
    params.push(new dw.web.URLParameter("siteId", siteId));

    if (product_ids && product_ids.length) {
        params.push(new dw.web.URLParameter("ids", product_ids, true));
    }
    return dw.system.RESTResponseMgr.createScapiRemoteInclude("product", "shopper-products", "v1", "products", params);
}

/**
* get the content assets from the products
*
* @function getProductContentAssets
* @param {object} slotConfig - object containing slot configurations
* @param {string} libraryId - library id
* @param {string} token - token id
* @returns {object} content assets
* @memberof ProductHelpers
*/
function getProductContentAssets(slotConfig, libraryId, token) {
    const contentHelpers = require('app_composable/cartridge/scripts/helpers/content/contentHelpers.js');
    if (!slotConfig.slot_content.product_ids || !slotConfig.callout_msg) {
        return [];
    }
    //grab content asset ids from markup on slot
    let contentArray = slotConfig.callout_msg.default.markup.split(',').map(function (content) {
        return content.trim();
    });
    // call ContentMgr script to grab content asset details
    let contentAssets = contentArray.map(assetId => {
        let contentModel = contentHelpers.buildContentAssetModel(assetId);
        return contentModel;
    });
    return contentAssets;
}

/**
 * Checks if a product is available for BOPIS
 * @function checkProductBopisEnabled
 * @param {Product|string} product
 * @returns true or false based on whether that product is available for BOPIS
 * @memberof ProductHelpers
 */
function checkProductBopisEnabled(product) {
    let availableForInStorePickup;
    //Depending on if product is a product type or a product's id, get the cache for it
    if (product instanceof dw.web.HttpParameter && product.value)  {
        let productObj = getProductAttributesUsingCache(product.value);
        availableForInStorePickup = productObj.custom.availableForInStorePickup;
    } else if (typeof product === 'object') {
        availableForInStorePickup = product.custom.availableForInStorePickup;
    } else {
        let productObj = getProductAttributesUsingCache(product);
        availableForInStorePickup = productObj.custom.availableForInStorePickup;
    }
    return availableForInStorePickup || false; 
}

/**
 * Returns qualifying promotions that should hide promo callout/details for the provided product.
 *
 * @function getProductQualifiedPromotions
 * @param {dw.catalog.Product} product - Product used to evaluate qualifying promotions.
 * @returns {Array<Object>} List of promotion/product key objects with shape `{ id, productID }`.
 * @memberof ProductHelpers
 */
function getProductQualifiedPromotions(product) {
    const qualifyingPromotions = []
    const plan = dw.campaign.PromotionMgr.getActiveCustomerPromotions();
    const qualifying = plan.getProductPromotionsForQualifyingProduct(product);
    qualifying.toArray().forEach(function (promo) {
        if ("hidePromoCalloutAndDetailsOnQualifyingItems" in promo.custom && promo.custom.hidePromoCalloutAndDetailsOnQualifyingItems) {
            qualifyingPromotions.push({
                'id': promo.ID,
                'productID': product.ID
            });
        }
    });
    return qualifyingPromotions;
}

/**
 * Filters the product promotions for a given product, using a cache to exclude promotions that do not qualify for a discount.
 *
 * Updates the `doc.productPromotions` array to only include promotions that are cached as qualifying but not discounted.
 * If the cache is empty for a promotion, it populates the cache based on the product's qualifying promotions.
 *
 * @function filterProductPromotions
 * @param {Object} doc - The document object containing a `productPromotions` array.
 * @param {dw.catalog.Product} product - The product to evaluate promotions for.
 * @memberof ProductHelpers
 */
function filterProductPromotions(doc, product) {
    try {
        
        doc.productPromotions = doc.productPromotions.toArray().filter(function (promo) {
            let returnValue = getProductQualifyingButNotDiscountedCache(product, promo.promotionId, doc.productPromotions.toArray().map(promo => promo.promotionId));            
            return returnValue;
        })
    } catch (e) {
        if (e && !e.message &&  product && product.ID) {
            e.message = 'Problem Product = ' + product.ID + ' Error = ' + e.message;
        }
        logHandler.logger.error(e, 'Hooks', 'product');
    }
}

/**
 * Builds promo visibility flags for a product and optionally primes the shared cache.
 *
 * Promotions where the product only qualifies (but is not discounted) are marked `false`.
 * Promotions already associated with the product document are marked `true`.
 *
 * @function loadProductQualifyingButNotDiscountedCache
 * @param {dw.catalog.Product} product - Product used to build cache keys.
 * @param {Array<string>} promotionIds - Promotion IDs currently associated with the document.
 * @param {dw.system.Cache} [cache] - Optional cache instance to populate with computed flags.
 * @returns {Object<string, boolean>} Object keyed by `promotionId_productId` with boolean flags.
 * @memberof ProductHelpers
 */
function loadProductQualifyingButNotDiscountedCache(product, promotionIds, cache) {
    
    if (empty(cache)) {
        cache = CacheMgr.getCache("productQualifyingButNotDiscounted");
    }

    let qualifyingPromotions = getProductQualifiedPromotions(product);

    var productPromoList = {};


    qualifyingPromotions.forEach(function (promo) {
        if (!empty(cache)) {
            cache.put(promo.id + "_" + promo.productID, false);
        }
        productPromoList[promo.id + "_" + promo.productID] = false;
    });
    promotionIds.forEach((promoId) => {
        if (!empty(cache)) {
            cache.put(promoId + "_" + product.ID, true);
        }
        productPromoList[promoId + "_" + product.ID] = true;
    });
    return productPromoList;
}

/**
 * Returns whether a promotion should be shown for a product based on qualifying-but-not-discounted cache data.
 *
 * @function getProductQualifyingButNotDiscountedCache
 * @param {dw.catalog.Product} product - Product used to build cache keys.
 * @param {string} promoId - Promotion ID to evaluate.
 * @param {Array<string>} promotionIds - Promotion IDs currently associated with the document.
 * @returns {boolean|undefined} True when promo should be shown, false when it should be filtered out, or undefined when no value is found.
 * @memberof ProductHelpers
 */
function getProductQualifyingButNotDiscountedCache(product, promoId, promotionIds) {
    let cache = CacheMgr.getCache("productQualifyingButNotDiscounted");
    let returnValue;

    if (!empty(cache)) {
        returnValue = cache.get(promoId + "_" + product.ID);
    }

    if (empty(returnValue)) {
        let promoData = loadProductQualifyingButNotDiscountedCache(product, promotionIds, cache);
        returnValue = promoData[promoId + "_" + product.ID];
    }

    
    return returnValue;
}





/**
 * Get attributes for a product using cache to reduce database calls.
 * @function getProductAttributesUsingCache
 * @param {string} productId - Product object or product id
 * @returns {object} - JSON object with requested attributes
 * @memberof ProductHelpers
 */
function getProductAttributesUsingCache(productId) {

    let response = {};

    if (!empty(productId)) {
        const productAttributesToSave = [
            "custom.PDPBannerCampaignID",
            "custom.isGiftCard",
            "custom.isVirtual",
            "custom.availableForInStorePickup",
            "ID",
            "searchableIfUnavailableFlag"
        ]

        let productCacheEnabled = Site.getCurrent().getCustomPreferenceValue('enableProductCustomCache');

        let cache;
        let cachedProductAttributes;

        if (productCacheEnabled) {
            cache = CacheMgr.getCache("productAttributeCache");
            cachedProductAttributes = cache.get(productId);
        }  

        if (cache && cachedProductAttributes && cachedProductAttributes.forceSoldOut && cachedProductAttributes.forceSoldOut.cacheRefreshTime) {
            let currentTime = new Date().getTime();
            if (currentTime >= cachedProductAttributes.forceSoldOut.cacheRefreshTime) {
                cache.invalidate(productId);
                cachedProductAttributes = null;
            }
        }


        if (!empty(cachedProductAttributes)) {
            response = cachedProductAttributes;
        } else {
            const product = ProductMgr.getProduct(productId);
            if (!empty(product)) {
                let productAttributesGoingIntoCache = {};
                productAttributesGoingIntoCache.custom = {};
                for (let i = 0; i < productAttributesToSave.length; i++) {
                    var custom = false;
                    var attribute = productAttributesToSave[i];
                    if (productAttributesToSave[i].includes('custom.')) {
                        custom = true;
                        attribute = productAttributesToSave[i].replace('custom.', '');
                    }

                    let productAttribute;

                    if (custom) {
                        productAttribute = convertAttributeToJSON(product.custom[attribute]);
                        productAttributesGoingIntoCache['custom'][attribute] = productAttribute;
                    } else {
                        productAttribute = convertAttributeToJSON(product[attribute]);
                        productAttributesGoingIntoCache[attribute] = productAttribute;
                    }
                }

                productAttributesGoingIntoCache.forceSoldOut = {};
                productAttributesGoingIntoCache.forceSoldOut.isForceSoldOut = ForceSoldOutHelper.isMarkedAsSoldOutProduct(product);
                productAttributesGoingIntoCache.forceSoldOut.cacheRefreshTime = ForceSoldOutHelper.refreshCacheTime(product);

                if (!empty(cache)) {
                    cache.put(productId, productAttributesGoingIntoCache);
                }

                response = productAttributesGoingIntoCache;
            }
        }
        return response;
    } else {
        logHandler.logger.error({ message: 'getProductAttributesUsingCache function needs proper parameters' }, 'Helpers', 'product');
        return response;
    }
}




/**
 * Get availability for a product using cache to reduce database calls.
 * @function getProductAvailabilityUsingCache
 * @param {string} productId - Product object or product id
 * @returns {object} - JSON object with requested attributes
 * @memberof ProductHelpers
 */
function getProductWebAvailabilityUsingCache(productId) {
    
    let response = {};

    if (!empty(productId)) {
        
        let cache;
        let productWebAvailability;

        
        cache = CacheMgr.getCache("productWebAvailabilityCache");
        productWebAvailability = cache.get(productId);
       
        if (!empty(productWebAvailability)) {
            response = productWebAvailability;
        } else {
            
            const product = ProductMgr.getProduct(productId);
            if (!empty(product)) {

                const getPurchaseLimit = require('app_composable/cartridge/scripts/helpers/global/BopisOrderLimits.js').getPurchaseLimit;

                let productWebAvailabilityGoingIntoCache = {};

                let purchaseLimit = getPurchaseLimit(product);

                let available = purchaseLimit ? Number(purchaseLimit) > 0 : false;

                productWebAvailabilityGoingIntoCache.purchaseLimit = purchaseLimit;
                productWebAvailabilityGoingIntoCache.available = available;

                if (!empty(cache)) {
                    cache.put(productId, productWebAvailabilityGoingIntoCache);
                }
                
                response = productWebAvailabilityGoingIntoCache;
            }
        }
        return response;
    } else {
        logHandler.logger.error({ message: 'getProductWebAvailabilityUsingCache function needs proper parameters' }, 'Helpers', 'product');
        return response;
    }
}

/**
 * Checks whether a product has inventory in nearby stores
 * @function hasInventoryNearbyStores
 * @param {product} product - product object from the hook call
 * @param {String} storeId - the id of the user's current selected store
 * @returns {boolean} - True or false for whether the product has stock in nearby stores
 * @memberof ProductHelpers
 */
function hasInventoryNearbyStores(product, storeId) {
    const getProductStoreAvailabilityUsingCache = require('app_composable/cartridge/scripts/helpers/global/BopisOrderLimits.js').getProductStoreAvailabilityUsingCache;
    
    const getNearbyStores = require('app_composable/cartridge/scripts/helpers/objects/BasketComponents/BopisHelper.js').getNearbyStores

    const stores = getNearbyStores(storeId);

    if (empty(stores)) {
        return false;
    }
    return stores.some(store => {
        return getProductStoreAvailabilityUsingCache(product, store)
    })
}

/**
 * Build Product PDP URL without .html extension for use in feeds and other places where a clean URL is needed.
 * @function getProductPageUrlWithoutHtml
 * @param {string} productId - SFCC product ID
 * @param {string} [urlType] - Optional parameter to specify URL type (e.g., 'https' or 'http'); defaults to 'https'
 * @returns {string} formatted product URL
 */
function getProductPageUrlWithoutHtml(productId, urlType) {

    let productUrl;
    let productUrlString = '';

    if (empty(urlType)) {
        urlType = 'https';
    }

    if (urlType === 'https') {
        productUrl = URLUtils.https('Product-Show', 'pid', productId);
    } else if (urlType == 'abs') {
        productUrl = URLUtils.abs('Product-Show', 'pid', productId);
    }

    if (!empty(productUrl)) {
        productUrlString = productUrl.toString().replace('.html', '');
    }
    return productUrlString;
}

module.exports = {
    getProductName,
    checkForCustomAttribute,
    getValueForCustomAttributeBool,
    hasSFCCInventory,
    getWebInventory,
    getStoreInventory,
    getSFCCAvailability,
    getProductStandardPrice,
    getProductSalePrice,
    getCustomerGroupContainsEveryone,
    getProductSalePriceWithoutCustomer,
    isProductAvailableInStore,
    getProductBanner,
    getProductContent,
    getProductContentAssets,
    checkProductBopisEnabled,
    productNameTranslationRequired,
    getProductQualifiedPromotions,
    filterProductPromotions,
    getProductQualifyingButNotDiscountedCache,
    getProductAttributesUsingCache,
    hasInventoryNearbyStores,
    getProductWebAvailabilityUsingCache,
    getProductPageUrlWithoutHtml
}
