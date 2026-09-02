'use strict';

const Site = require('dw/system/Site').getCurrent();
const RESTResponseMgr = require('dw/system/RESTResponseMgr');
const ProductSearchModel = require('dw/catalog/ProductSearchModel');

const constructorSvc = require('app_composable/cartridge/scripts/helpers/constructor/constructorSvc');
const PagingModel = require('dw/web/PagingModel');

const ProductHelper = require('app_composable/cartridge/scripts/helpers/objects/product.js');
const BopisOrderLimits = require('app_composable/cartridge/scripts/helpers/global/BopisOrderLimits.js');
const sitePrefHelper = require('app_composable/cartridge/scripts/helpers/util/sitePrefHelper');

const isConstructor = sitePrefHelper.getSitePrefValue('ConstructrEnabled');
const enableConstructorBrowse = sitePrefHelper.getSitePrefValue('enableConstructorBrowse');
const enableProductsAvailabilityInCustomSearchAPI = sitePrefHelper.getSitePrefValue('enableProductsAvailabilityInCustomSearchAPI');

const CatalogMgr = require('dw/catalog/CatalogMgr');

// Only the fields actually consumed by the PLP tile remote includes.
// Requires expand=prices for currency+price, expand=promotions for productPromotions,
// expand=images for imageGroups.
// Excludes: inventory, longDescription, shortDescription, type.item, type.master,
// imageGroups.images.title, primaryCategoryId, slugUrl, upc, validFrom, validTo,
// minOrderQuantity, stepQuantity, pricePerUnit, c_MSRP, c_bvRatingRange.
// Note: productPromotions.rank is NOT returned by SCAPI. Rank is sourced from the
// Constructor.io catalog index (written by link_constructor_custom getProductPromotions.js
// via promo.getRank()) and mapped onto the tile in useGetSearchChunks.ts. The SCAPI
// productPromotions here only supplement promotionId and calloutMsg.
let TILE_FIELDS = [
    'id',
    'name',
    'currency',
    'price',
    'type.(set)',
    'imageGroups.(viewType,images.(link,disBaseLink,alt))',
    'productPromotions.(promotionId,calloutMsg)',
    'c_descriptiveName',
    'c_productName',
    'c_productNameTranslationRequired',
    'c_form',
    'c_fragranceName',
    'c_listPrice',
    'c_salePrice',
    'c_forceSoldOut',
    'c_availableForInStorePickup',
    'c_isGiftCard',
    'c_productBadgeIcon',
    'c_autoRefresh',
    'c_bvAverageRating',
    'c_bvReviewCount'
].join(',');

const customProductSearchAPIadditionalProductAttributes = Site.getCustomPreferenceValue('customProductSearchAPIadditionalProductAttributes') || '';

if (!empty(customProductSearchAPIadditionalProductAttributes)) {
    TILE_FIELDS = TILE_FIELDS + ',' + customProductSearchAPIadditionalProductAttributes;
}

const selectQuerySingleCustomPreference = '(' + TILE_FIELDS + ')';

const CacheMgr = require('dw/system/CacheMgr');

// ---------------------------------------------------------------------------
// Shared validation — centralises the two "un-refinable" attribute checks
// ---------------------------------------------------------------------------

/**
 * Returns true if a product should be INCLUDED in search results.
 *
 * Two product attributes cannot be used as native SFCC search refinements:
 *   1. forceSoldOut — computed from a time window, not a static boolean.
 *   2. searchableIfUnavailableFlag + actual availability — the flag is indexed
 *      but the combination of "flag is false AND product is currently unavailable"
 *      requires a live availability check the search index can't perform.
 *
 * Both checks are gated by searchableIfUnavailableFlag.  When the flag is
 * true the product stays in results unconditionally — even when force sold
 * out — because the merchandiser explicitly opted into that behaviour.
 *
 * Both the Constructor path and the SFCC path call this function so the
 * filtering logic lives in exactly one place.
 *
 * @param {string} productId - The product ID to evaluate.
 * @param {string[]} storeIds - Parsed array of store inventory list IDs (may be empty).
 * @param {boolean} [hitAvailable] - Optional: live availability from the
 *   ProductSearchHit (SFCC path only), via hit.product.availabilityModel.available.
 *   When the search model has inventory list IDs set, the availability model
 *   evaluates against those specific lists.  When no ILIDs, it reflects the
 *   default (web) inventory.  Pass undefined/null from the Constructor path
 *   (no ProductSearchHit exists).
 * @returns {boolean} true = include this product in results.
 */
function shouldIncludeProduct(productId, storeIds, hitAvailable) {
    // Retrieve product attributes from cache (populates on miss via ProductMgr).
    const productAttrCache = CacheMgr.getCache('productAttributeCache');

    let product = productAttrCache ? productAttrCache.get(productId) : null;
    if (!product) {
        product = ProductHelper.getProductAttributesUsingCache(productId);
    }

    // searchableIfUnavailableFlag === true → keep unconditionally.
    // The merchandiser explicitly wants this product in results regardless
    // of stock or force-sold-out status.
    if (product && product.searchableIfUnavailableFlag) {
        return true;
    }

    // --- Below: searchableIfUnavailableFlag is false (or product not found) ---

    // 1. Force Sold Out — time-windowed, not search-refinable.
    if (product && product.forceSoldOut && product.forceSoldOut.isForceSoldOut) {
        return false;
    }

    // 2. Live availability check (SFCC path only).
    //    hit.product.availabilityModel.available checks real-time inventory
    //    scoped to the inventory list IDs passed to setInventoryListIDs(),
    //    or the default (web) inventory when no ILIDs are set.
    //    On the Constructor path hitAvailable is undefined so we fall through
    //    to the store-availability cache check.

    const productAvailability = ProductHelper.getProductWebAvailabilityUsingCache(productId);

    if (productAvailability.available === true) {
        return true;
    }

    let storeAvailCache;

    if (storeIds && storeIds.length > 0) {
        storeAvailCache = CacheMgr.getCache('storeAvailabilitySCAPI');
    }


    // 3. Store-level availability fallback.
    //    Check the per-product per-store availability cache and the
    //    availableForInStorePickup custom attribute.
    if (product) {
        let availableInAnyStore = false;
        if (storeAvailCache) {
            for (let s = 0; s < storeIds.length; s++) {

                if (BopisOrderLimits.getProductStoreAvailabilityUsingCache(productId, storeIds[s], storeAvailCache)) {
                    availableInAnyStore = true;
                    break;
                }
            }
        }
        if (availableInAnyStore && (product.custom && product.custom.availableForInStorePickup)) {
            return true;
        }
    }

    // Not orderable, not available in any store, not BOPIS — exclude.
    return false;
}

/**
 * Parses a comma-separated inventory list ID string into a trimmed array.
 * @param {string|null} storeInvId
 * @returns {string[]}
 */
function parseStoreIds(storeInvId) {
    return storeInvId
        ? storeInvId.split(',').map(function (id) { return id.trim(); }).filter(Boolean)
        : [];
}


// ---------------------------------------------------------------------------
// Remote include builders
// ---------------------------------------------------------------------------

/**
 * Splits product IDs into chunks and delegates to the correct include builder
 * based on chunkSize.
 * @param {string[]} idArray
 * @param {string} siteId
 * @returns {Array}
 */
function buildIncludes(idArray, siteId) {
    let includes = [];
    const chunkSize = 1;
    for (let i = 0; i < idArray.length; i += chunkSize) {
        let chunk = idArray.slice(i, i + chunkSize);

        includes.push(buildSingleInclude(chunk[0], siteId));

    }
    return includes;
}

/**
 * Builds a single-product remote include using the products/{id} endpoint.
 * Supports allImages.
 * @param {string} productId
 * @param {string} siteId
 * @returns {*} SCAPI remote include
 */
function buildSingleInclude(productId, siteId) {
    return RESTResponseMgr.createScapiRemoteInclude(
        'product',
        'shopper-products',
        'v1',
        'products/' + productId,
        new dw.web.URLParameter('select', selectQuerySingleCustomPreference),
        new dw.web.URLParameter('expand', 'images,promotions,prices'),
        new dw.web.URLParameter('currency', 'USD'),
        new dw.web.URLParameter('allImages', 'true'),
        new dw.web.URLParameter('siteId', siteId)
    );
}


/**
 * Normalizes Constructor.io sort_options into the standard SCAPI format.
 * Constructor returns: [{ sort_by, display_name, status, sort_order? }]
 * SCAPI expects:       { sortingOptions: [{ id, label }], selectedSortingOption: string }
 *
 * The compound ID is "sort_by" when no sort_order exists, or "sort_by:sort_order"
 * when one does (e.g. "price:ascending"). The client sends this ID back as c_sort.
 *
 * @param {Array} constructorSortOptions - sort_options array from Constructor response
 * @returns {{ sortingOptions: Array<{id: string, label: string}>, selectedSortingOption: string|null }}
 */
function normalizeConstructorSortOptions(constructorSortOptions) {
    let sortingOptions = [];
    let selectedSortingOption = null;

    if (constructorSortOptions && constructorSortOptions.length) {
        for (let i = 0; i < constructorSortOptions.length; i++) {
            let opt = constructorSortOptions[i];
            // Build compound ID: "sort_by" or "sort_by:sort_order"
            let id = opt.sort_by;
            if (opt.sort_order) {
                id = opt.sort_by + ':' + opt.sort_order;
            }
            sortingOptions.push({
                id: id,
                label: opt.display_name
            });
            if (opt.status === 'selected') {
                selectedSortingOption = id;
            }
        }
    }

    // Default to first option if nothing was marked selected
    if (!selectedSortingOption && sortingOptions.length > 0) {
        selectedSortingOption = sortingOptions[0].id;
    }
    return { sortingOptions: sortingOptions, selectedSortingOption: selectedSortingOption };
}

function filterPairJson(filters) {
    let filterPairs = [];
    if (filters) {
        const filterParts = filters.split(',');
        for (let f = 0; f < filterParts.length; f++) {
            let eqIdx = filterParts[f].indexOf('|');
            if (eqIdx > -1) {
                let attrId = filterParts[f].substring(0, eqIdx).trim();
                let attrValue = filterParts[f].substring(eqIdx + 1).trim();
                if (attrId && attrValue) {
                    filterPairs.push({ attrId: attrId, attrValue: attrValue });
                }
            }
        }
    }
    return filterPairs;

}

/**
 * Validates Constructor.io product IDs, preserving Constructor's ranking order.
 * Delegates to shouldIncludeProduct() for the actual filtering logic so both
 * the Constructor and SFCC paths use identical validation.
 *
 * @param {string[]} rawIds - Ordered product IDs from Constructor
 * @param {string[]} storeIds - Parsed store inventory list IDs (already split & trimmed)
 * @returns {{ ids: string[], skipped: number }}
 */
function validateConstructorIds(rawIds, storeIds) {
    let validIds = [];
    let skipped = 0;

    for (let i = 0; i < rawIds.length; i++) {
        if (shouldIncludeProduct(rawIds[i], storeIds)) {
            validIds.push(rawIds[i]);
        } else {
            skipped++;
        }
    }
    return { ids: validIds, skipped: skipped };
}

/**
 * Runs a ProductSearchModel search (non-Constructor fallback path).
 * Supports both category browse (cgid) and keyword search (q).
 * Applies any pipe-delimited attribute filters from c_filters.
 * Delegates post-fetch filtering to shouldIncludeProduct() (shared with Constructor path).
 *


 * @param {number} limit - Max products to return
 * @param {number} offset - Zero-based start index
 * @param {string} [cgid] - SFCC categoryID for category browse
 * @param {string} [q] - Search phrase for keyword search
 * @param {string[]} [storeIds] - Parsed store inventory list IDs (already split & trimmed)
 * @param {string} [filters] - Pipe-delimited filter string, each entry in "attributeId=value" format
 * @param {string} [sort] - SFCC SortingRule ID (e.g. 'best-matches', 'price-low-to-high')
 * @returns {{ ids: string[], skipped: number, facets: Array, sortingOptions: Array, selectedSortingOption: string|null, totalProducts: number, endOfSearchResults: boolean }}
 */
function sfccProductSearch(limit, offset, cgid, q, storeIds, filters, sort) {
    const searchLimit = limit || 24;
    const searchOffset = offset || 0;
    let searchModel = new ProductSearchModel();

    if (storeIds && storeIds.length > 0) {
        const invList = new dw.util.ArrayList();
        storeIds.forEach(function (id) { invList.add(id); });
        searchModel.setInventoryListIDs(invList);
    }

    // Category browse vs keyword search — script.js validates that exactly
    // one of cgid or q is provided, never both.
    if (q) {
        searchModel.setSearchPhrase(q);
    } else if (cgid) {
        searchModel.setCategoryID(cgid);
        searchModel.setRecursiveCategorySearch(true);
    }

    // Apply sort before search. CatalogMgr.getSortingRule() returns the
    // SortingRule configured in Business Manager for the given ID.
    // If omitted or not found, the category's default sort is used.
    if (sort) {
        const sortingRule = CatalogMgr.getSortingRule(sort);
        if (sortingRule) {
            searchModel.setSortingRule(sortingRule);
        }
    }

    filterPairJson(filters).forEach(function (pair) {
        searchModel.addRefinementValues(pair.attrId, pair.attrValue);
    });

    searchModel.search();

    // --- Facets (refinements) ---
    // Shaped to match Constructor's facets: { name, display_name, type, options: [{ value, display_name, count }] }
    const facets = [];
    const refinements = searchModel.refinements;
    const refinementDefs = refinements.refinementDefinitions.iterator();
    while (refinementDefs.hasNext()) {
        let def = refinementDefs.next();
        let options = [];
        let refinementValues = refinements.getAllRefinementValues(def).iterator();
        while (refinementValues.hasNext()) {
            let rv = refinementValues.next();
            options.push({
                value: rv.value,
                display_name: rv.displayValue,
                count: rv.hitCount
            });
        }
        facets.push({
            name: def.attributeID,
            display_name: def.displayName,
            type: 'multiple',
            options: options
        });
    }


    // --- Sorting options ---
    // Shaped to match SCAPI productSearch response: { id, label } + selectedSortingOption.
    // CatalogMgr.getSortingOptions() returns the site-level sorting options
    // configured in Business Manager. Only set selectedSortingOption when the
    // caller explicitly requested a sort via c_sort.
    const sortingOptions = [];
    let selectedSortingOption = null;
    const siteOptions = CatalogMgr.getSortingOptions();
    if (siteOptions) {
        const optIter = siteOptions.iterator();
        while (optIter.hasNext()) {
            let opt = optIter.next();
            let ruleId = opt.sortingRule ? opt.sortingRule.ID : opt.ID;
            sortingOptions.push({
                id: ruleId,
                label: opt.displayName
            });
        }
    }
    // Only reflect the selected option when the caller explicitly sent c_sort.
    if (sort) {
        selectedSortingOption = sort;
    }

    // Use a 2× buffer over searchLimit so filtering (forceSoldOut, store availability)
    // has headroom without loading the entire result set into the iterator window.
    // The while loop below still caps actual output at searchLimit.
    const pagingModel = new PagingModel(searchModel.productSearchHits, searchModel.count);
    pagingModel.setPageSize(Math.min(searchLimit, searchModel.count));
    pagingModel.setStart(searchOffset);

    let ids = [];
    let skipped = 0;
    const pageElements = pagingModel.pageElements;
    while (pageElements.hasNext() && ids.length < searchLimit) {
        let hit = pageElements.next();

        // Uses the same shouldIncludeProduct() as the Constructor path.
        // Passes hit.product.availabilityModel.available so real-time
        // inventory is used as a gate before the store-availability cache.
        let hitOrderable = hit.product && hit.product.availabilityModel
            ? hit.product.availabilityModel.orderable
            : undefined;
        if (shouldIncludeProduct(hit.productID, storeIds, hitOrderable)) {
            ids.push(hit.productID);
        } else {
            skipped++;
            continue;
        }
    }

    const totalProducts = searchModel.count - skipped;
    const endOfSearchResults = searchOffset + skipped + ids.length >= totalProducts;

    return { ids, skipped, facets, sortingOptions, selectedSortingOption, totalProducts, endOfSearchResults };
}


/**
 * Main entry point for the product search custom API.
 * @param {number} offset - Zero-based pagination offset.
 * @param {number} limit - Maximum number of products to return (default 24).
 *   1  → one include per product via products/{id} (allImages supported)
 *   >1 → one include per chunk via products?ids=... (batch)
 * @param {string} [storeId] - Store ID for BOPIS filtering.

 * @param {string} [filters] - Pipe-delimited refinement filters.
 * @param {string} [cgid] - Category group ID (e.g. 'all-candles').
 * @param {string} [q] - Search term.
 * @param {string} [sort] - Sorting option ID. For SFCC this is a SortingRule ID
 *   (e.g. 'best-matches'). For Constructor this is 'sort_by' or 'sort_by:sort_order'
 *   (e.g. 'price:ascending'). Omit to use the default sort.
 * @param {string} [clientId] - Constructor.io client ID (`i` param). Globally unique
 *   browser/app instance identifier. Only sent to Constructor when provided.
 * @param {string} [sessionId] - Constructor.io session number (`s` param). Starts at 1,
 *   increments after 30 min inactivity. Only sent to Constructor when provided.
 * @returns {{ c_results: Array, c_facets: Array, c_sortingOptions: Array, c_selectedSortingOption: string|null, c_nextProduct: number, [c_productsAvailability: Object] }} Response payload with product IDs and metadata for building the PLP, plus availability info for each product ID.
 */
exports.search = function (offset, limit, storeId, filters, cgid, q, sort, clientId, sessionId) {
    const storeHelpers = require('app_composable/cartridge/scripts/helpers/store/storeHelpers.js');
    const siteId = Site.ID;
    const searchLimit = parseInt(limit, 10) || 24;
    const searchOffset = parseInt(offset, 10) || 0;

    // Parse store inventory list IDs once; pass the arrays to downstream functions
    // so they don't each re-split the same string.
    let storeInvId;
    let storeIds;
    if (!empty(storeId)) {
        storeInvId = storeHelpers.getStoreAttributesUsingCache(storeId).inventoryListId || null;
        storeIds = parseStoreIds(storeInvId || storeId);
    }


    // Scoped clearly — no reliance on hoisting across if/else branches.
    let validProductIds;
    let skipped = 0;
    let facets = [];
    let sortingOptions = [];
    let selectedSortingOption = null;
    let totalProducts = 0;
    let endOfSearchResults = false;

    let useConstructor = false;

    let typeOfSearch = 'SFCC Search';

    if (enableConstructorBrowse && cgid) {
        useConstructor = true;
        typeOfSearch = 'Constructor Browse';
    } else if (isConstructor && q) {
        useConstructor = true;
        typeOfSearch = 'Constructor Search';
    }


    if (useConstructor) {
        const svcResult = constructorSvc.search.call({ pageSize: searchLimit, offset: searchOffset, cgid: cgid, q: q, storeId: storeId, filters: filters, sort: sort, clientId: clientId, sessionId: sessionId });
        if (!svcResult.ok) {
            throw svcResult;
        }
        const constructorData = svcResult && svcResult.ok ? svcResult.object : null;
        const rawIds = constructorData ? constructorData.productIds.split(',').filter(Boolean) : [];
        const constructorResult = validateConstructorIds(rawIds, storeIds);

        validProductIds = constructorResult.ids.slice(0, searchLimit);
        skipped = constructorResult.skipped;
        facets = constructorData.facets || [];
        totalProducts = constructorData.total_num_results;
        endOfSearchResults = searchOffset + rawIds.length >= totalProducts;

        // Normalize Constructor sort_options → SCAPI format { id, label }
        const normalizedSort = normalizeConstructorSortOptions(constructorData ? constructorData.sort_options : []);
        sortingOptions = normalizedSort.sortingOptions;
        selectedSortingOption = normalizedSort.selectedSortingOption;
    } else {
        const sfccResult = sfccProductSearch(searchLimit, searchOffset, cgid, q, storeIds, filters, sort);
        validProductIds = sfccResult.ids;
        totalProducts = sfccResult.totalProducts;
        skipped = sfccResult.skipped;
        endOfSearchResults = sfccResult.endOfSearchResults;
        facets = sfccResult.facets;
        sortingOptions = sfccResult.sortingOptions;
        selectedSortingOption = sfccResult.selectedSortingOption;

        const cacheTTLManager = require('app_composable/cartridge/scripts/helpers/util/cacheTTLManager.js');
        cacheTTLManager.setResponseTTL();
    }





    let theReturn = {
        c_typeOfSearch: typeOfSearch,
        c_nextProduct: skipped + searchLimit + searchOffset,
        c_endOfSearchResults: endOfSearchResults,
        c_totalProducts: totalProducts,
        c_results: buildIncludes(validProductIds, siteId),
        c_facets: facets,
        c_sortingOptions: sortingOptions,
        c_selectedSortingOption: selectedSortingOption
    };


    if (enableProductsAvailabilityInCustomSearchAPI) {
        let productsAvailability = {};
        validProductIds.forEach(function (productId) {
            const webAvailability = ProductHelper.getProductWebAvailabilityUsingCache(productId);
            const productAttrs = ProductHelper.getProductAttributesUsingCache(productId);
            const isForceSoldOut = productAttrs && productAttrs.forceSoldOut && productAttrs.forceSoldOut.isForceSoldOut;
            let singleProductAvailability = {};
            singleProductAvailability.webPurchaseLimit = isForceSoldOut ? 0 : (webAvailability ? webAvailability.purchaseLimit : 0);
            singleProductAvailability.webOrderable = isForceSoldOut ? false : (webAvailability ? webAvailability.available : false);
            if (storeId) {
                const bopisAvailability = BopisOrderLimits.getProductStorePurchaseLimitUsingCache(productId, storeId);
                singleProductAvailability.bopisPurchaseLimit = isForceSoldOut ? 0 : (bopisAvailability ? bopisAvailability : 0);
                singleProductAvailability.bopisStoreOrderable = isForceSoldOut ? false : (bopisAvailability ? bopisAvailability > 0 : false);
            }
            productsAvailability[productId] = singleProductAvailability;
        });
        theReturn.c_productsAvailability = productsAvailability;
    }

    return theReturn;
};