'use strict'
const adobeHelper = require('app_composable/cartridge/scripts/helpers/adobe/adobeHelper');
const Site = require('dw/system/Site').getCurrent();
const BopisHelper = require('app_composable/cartridge/scripts/helpers/objects/BasketComponents/BopisHelper');
const StoreHelper = require('app_composable/cartridge/scripts/helpers/store/storeHelpers')
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler').logHandler;
const BasketMgr = require('dw/order/BasketMgr');
const ShopperContextMgr = require('dw/customer/shoppercontext/ShopperContextMgr');
const ShopperContext = require('dw/customer/shoppercontext/ShopperContext');
const StoreMgr = require('dw/catalog/StoreMgr');

/**
 * Functions used in the OnSession API
 * @namespace OnSessionAPI
 */

/**
 * creates the onSession for the unique customer
 * @function postOnSession
 * @param {Object} requestBody - API request body
 * @returns {response} Returns response object
 */
exports.postOnSession = function postOnSession(requestBody) {
        // Parse the request body and extract geolocation information
        const skipAgentGeolocation = session.isUserAuthenticated() || (!empty(requestBody.skipAgentGeolocation) && requestBody.skipAgentGeolocation);
        // check if the request has any of these fields if not set as empty and set these later
        const GeoLocation = requestBody.GeoLocation || {};
        const Auth = requestBody.Auth || {};
        const BOPIS = requestBody.BOPIS || {};
        const UserAgent = requestBody.UserAgent || {};
        const requestIp = (request.httpHeaders.get('c_fastly-client-ip')) || (GeoLocation.ipAddress) || (request.httpRemoteAddress);
        const requestLat = GeoLocation.Latitude || session.custom.latitude || null;
        const requestLong = GeoLocation.Longitude || session.custom.longitude || null;
        const enableAutoSetPreferredStore = Site.getCustomPreferenceValue('enableAutoSetPreferredStore');
        const enableStoreInventoryList = Site.getCustomPreferenceValue('enableNativeStoreInventoryList');

        let response = {};
        let preferredStore = null; // Initialize preferredStore at the top of the function

    // Determine if geolocation needs to be fetched. if its not in session or in request then fetch
    let lat = requestLat;
    let long = requestLong;
    let shopperContext;
    let targetCampaigns;

    if (session.custom.init) {
        shopperContext = ShopperContextMgr.getShopperContext();
    }

        // Initiate shopper context if it does not exist
        if (empty(shopperContext)) {
            shopperContext = new ShopperContext();
            shopperContext.setClientIP(requestIp);
            ShopperContextMgr.setShopperContext(shopperContext, true);
        }

            // if geolocation is set to be skipped in request then don't enter here. If we already have the lat and long we don't need to enter here
            if (!skipAgentGeolocation && (!lat || !long)) {
                const geolocation = ShopperContextMgr.getGeolocation();
                // set the location information in the response under Geolocation
                if (geolocation.available) {
                    response.Geolocation = {
                        ipAddress: requestIp,
                        CountryCode: geolocation.countryCode,
                        Country: geolocation.countryName,
                        City: geolocation.city,
                        PostalCode: geolocation.postalCode,
                        MetroCode: geolocation.metroCode,
                        Region: geolocation.regionName,
                        RegionCode: geolocation.regionCode,
                        Latitude: geolocation.latitude,
                        Longitude: geolocation.longitude,
                        error: false
                    };
                    // set lat long to get used later
                    lat = geolocation.latitude;
                    long = geolocation.longitude;
                } else {
                    response.Geolocation = {
                        ipAddress: false,
                        error: true,
                        errorMsg: 'for Request IP "' + requestIp + '"'
                    };
                    lat = null;
                    long = null;
                }
            } else {
                response.Geolocation = {
                    Latitude: lat,
                    Longitude: long,
                    error: false
                }
            }
        if (enableAutoSetPreferredStore) {
            // Determine preferred store
            let isPreferredStore;
            const previouslyPreferredStore = StoreHelper.findPreferredStore();
            // if the we have preferred store in the request then set to that
            if (BOPIS.PreferredStore) {
                isPreferredStore = true;
                preferredStore = BOPIS.PreferredStore;
                // if we don't then use previous preferred store
            } else if(!empty(previouslyPreferredStore)){
                isPreferredStore = true;
                preferredStore = StoreHelper.mapStore(StoreMgr.getStore(previouslyPreferredStore));
            }
            // if neither of those are true and we have the lat / long then we need to find the store and set it
            else if (!skipAgentGeolocation && !response.Geolocation.error && lat && long){
                // find store based on lat long
                const stores = StoreMgr.searchStoresByCoordinates(Number(lat), Number(long), "mi", 50);
                // find stores with inventory and are bopis on
                const filteredStores = stores && stores.entrySet().toArray().filter(storeObj => {
                    let store = storeObj && storeObj.key;
                    return store && 
                           store.custom && 
                           (enableStoreInventoryList ? store.inventoryListID : store.custom.inventoryListId) && 
                           (empty(store.custom.turnBopisStoreOff) || store.custom.turnBopisStoreOff != true);
                }).sort((a, b) => a.getValue() - b.getValue());
                // check if store call succeeded
                if (filteredStores && filteredStores.length > 0 && filteredStores[0] && filteredStores[0].key) {
                    preferredStore = StoreHelper.mapStore(filteredStores[0].key);
                    isPreferredStore = false;
                } else {
                    // handle if store call is not ok
                    preferredStore = null;
                    isPreferredStore = false;
                    logHandler.logger.debug({message: "Store search returned no results for Request IP '" + requestIp + "'"}, 'CustomAPI', 'OnSession');
                }

            } else {
                // handle if shopper context call failed
                preferredStore = null;
                isPreferredStore = false;
                logHandler.logger.debug({message: "Store search returned no results for Request IP '" + requestIp + "'"}, 'CustomAPI', 'OnSession');

            }

            //tell front end if store update is needed
            response.c_updatePreferredStore = BopisHelper.handlePreferredStore('onSession',preferredStore);

            // Prepare BOPIS response
            response.BOPIS = {
                SessionStore: preferredStore,
                IsPreferredStore: isPreferredStore
            };
        } else {
            // If enableAutoSetPreferredStore is false, skip store logic and set default variables
            response.BOPIS = {
                SessionStore: null,
                IsPreferredStore: false
            };
            response.c_updatePreferredStore = false;
        }
        // Get mcmid value for adobe
        try {
        let mcmidValue = Auth.mcmid || adobeHelper.setMCMIDFromAPI();
        targetCampaigns = adobeHelper.callAdobeTargetDeliveryAPI(mcmidValue);

        // set the adobe values if they exist
        response.Adobe = {
            mcmid: mcmidValue,
            mboxes: targetCampaigns ? targetCampaigns.mboxes : null,
            targetcg: targetCampaigns ? targetCampaigns.targetcg : null,
            featuretoggles: targetCampaigns ? targetCampaigns.featuretoggles : null,
            targetflags: targetCampaigns ? targetCampaigns.targetflags : null,
            targetAnalyticsData: targetCampaigns ? targetCampaigns.targetAnalyticsData : null
        };
    }
    catch (e) {
        logHandler.logger.error({ message: 'Adobe Target OnSession Error: ' + e.message }, 'AdobeTarget', 'OnSession');
        response.Adobe = {};
    }

    // if shopperContext is turned on then make the call
    if (Site.getCustomPreferenceValue('onSessionToggleShopperContext')) {
        // Update shopper context request body
        var customQualifiers = new dw.util.HashMap();
        customQualifiers.put("targetcg", targetCampaigns ? targetCampaigns.targetcg : null);
        customQualifiers.put("featuretoggles", targetCampaigns ? targetCampaigns.featuretoggles : null);
        customQualifiers.put("sessionStore", JSON.stringify(preferredStore));
        customQualifiers.put("device", UserAgent.device || request.httpHeaders.get('user-agent'));
        customQualifiers.put("isShopInApp", UserAgent.isShopInApp || false);
        customQualifiers.put("isShopInAppPlatform", UserAgent.isShopInAppPlatform || "");
        customQualifiers.put("latitude", lat);
        customQualifiers.put("longitude", long);
        customQualifiers.put("init", "1");

        shopperContext.setClientIP(requestIp);
        shopperContext.setCustomQualifiers(customQualifiers);
        ShopperContextMgr.setShopperContext(shopperContext, true);
    }
    // add radial data do the current basket
    const currentBasket = BasketMgr.getCurrentBasket();
    if (!empty(currentBasket)) {
        currentBasket.custom.RadialCustomerVisitTimeStart = Date.now();
        currentBasket.custom.RadialCCAuthAttempts = 0;
    }

    return response;
};
