'use strict';

const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;
const CustomObjectMgr = require('dw/object/CustomObjectMgr');
const Site = require('dw/system/Site').getCurrent();

/**
 * Sets the cache expiration and applies cache settings based on API configuration.
 *
 * This function retrieves the cache configuration, checks if caching is enabled,
 * and applies custom cache TTL and personalization settings to the response if applicable.
 * It also handles errors that may occur during the cache configuration process.
 *
 * @function setResponseTTL
 * @param {Number} [customTTLTime] - Optional - A number representing minutes, used for setting a custom TTL for a cache
 * @returns {boolean} Always returns true.
 */
function setResponseTTL(customTTLTime) {

    if (!request.isSCAPI()) {
        return true;
    }

    try {
        const apiIDs = getCachePathDetails();

        const scapiCacheConfig = apiIDs && (fetchCacheConfig(apiIDs.FullURL) || fetchCacheConfig(apiIDs.URI));

        if (!scapiCacheConfig || !scapiCacheConfig.custom.Enable) {
            const cacheTTLLogEnable = Site.getCustomPreferenceValue('cacheTTLLogEnable');
            let error = {};
            error.message = 'Unable to Find the Custom Object or Caching Disbale for Full URL : ' +
                `${apiIDs.FullURL} or Default URL : ${apiIDs.URI}`;

            // Check if validation is enabled in the custom preferences
            if (!empty(cacheTTLLogEnable) && cacheTTLLogEnable){
                logHandler.logger.debug(error, 'cacheTTL', 'CacheTTL');
            }

            return true; // No caching is applied if config is null or disabled.
        }
        if (customTTLTime && customTTLTime < scapiCacheConfig.custom.TTL) {
            setCacheTTLinMinutes(customTTLTime)
        } else {
            setCacheTTLinMinutes(scapiCacheConfig.custom.TTL);
        }
        applyCachePersonalization(scapiCacheConfig.custom.isPersonalized);

    } catch (e) {
        logHandler.logger.error(e, 'cacheTTL', 'CacheTTL');
    }

    return true;
}

/**
 * Sets the expiration time for the response cache.
 *
 * @param {number} ttl - The time-to-live value in minutes.
 */
function setCacheTTLinMinutes(ttl) {
    const expiresTime = Date.now() + (ttl * 1000 * 60);
    response.setExpires(expiresTime);
}

/**
 * Applies cache variation based on personalization settings.
 *
 * @param {boolean} isPersonalized - Whether the cache should vary based on user personalization.
 */
function applyCachePersonalization(isPersonalized) {
    if (isPersonalized) {
        response.setVaryBy("price_promotion");
    }
}

/**
 * Retrieves the cache path details including the URI and optionally the full URL.
 *
 * This function constructs an object that contains the URI of the request and, if present,
 * the full URL formed by appending the query string to the URI. This helps in identifying
 * unique cache keys based on the request path and query parameters.
 *
 * The returned object contains:
 * - `URI`: The path pattern of the request.
 * - `FullURL` (optional): The full URL with the query string, if available.
 *
 * @function getCachePathDetails
 * @returns {Object} An object containing the `URI` and optionally the `FullURL`:
 *   - `URI` {string} - The URI path pattern of the request.
 *   - `FullURL` {string} - The full URL including the query string, if present.
 */
function getCachePathDetails() {

    if(!request && !request.SCAPIPathPattern){
        logHandler.logger.error("Request for caching is null", 'cacheTTL', 'CacheTTL');
        return null;
    }

    let pathPattern = { URI: request.SCAPIPathPattern };
    const params = request.getHttpParameterMap();
    let queryString = '';

    const expandKey = params.isParameterSubmitted("expand") ? params.get("expand").getStringValue() : null;
    if (expandKey) {
        if (expandKey.includes('availability')){
            queryString = '?expand=availability';

        } else if (expandKey.includes('prices') || expandKey.includes('promotions')) {
            queryString = '?expand=prices';
        }
    }

    //Checking the request coming from agent if yes then use different cache data.
    const type = params.isParameterSubmitted("type") ? params.get("type").getStringValue() : null;
    if (type && type == 'agent') {
        queryString = '?type=agent';
    }

    const c_personalized = params.isParameterSubmitted("c_personalized") ? params.get("c_personalized").getStringValue() : null;
    if (c_personalized) {
        queryString = '?personalized='+c_personalized;
    }

    //Checking the product id while fetching the store data, if product id present then use different cache.
    const c_productId = params.isParameterSubmitted("c_productId") ? params.get("c_productId").getStringValue() : null;
    if (c_productId) {
        queryString = '?product=true';
    }

    //Checking the custom Object type present and fetch the cache based on custom object type.
    const c_type = params.isParameterSubmitted("c_type") ? params.get("c_type") : null;
    if (c_type) {
        queryString = '?type='+c_type;
    }

    if (queryString) {
        pathPattern.FullURL = `${pathPattern.URI}/${queryString}`;
    }

    return pathPattern;
}

/**
 * Attempts to fetch the cache configuration for the given API identifier (URL or URI).
 *
 * @param {string} apiID - The API identifier (either FullURL or URI).
 * @returns {Object|null} The cache configuration if found, or null if not found.
 */
function fetchCacheConfig(apiID) {
    if (!apiID) return null;

    try {
        return CustomObjectMgr.getCustomObject('SCAPICacheConfiguration', apiID);
    } catch (e) {
        return null;
    }
}

exports.setResponseTTL = setResponseTTL;
