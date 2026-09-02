'use strict'

const apiUtils = require('app_composable/cartridge/scripts/apiUtils.js');
const contentSlotAPI = require('app_composable/cartridge/scripts/apis/contentSlotAPI.js');
const errorHandler = require('app_composable/cartridge/scripts/helpers/util/errorHandler.js').errorHandler;
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;
const Site = require('dw/system/Site').getCurrent();
const cacheTTLManager = require('app_composable/cartridge/scripts/helpers/util/cacheTTLManager.js');




/**
 * This endpoint provides access to content slot configuration and content data.
 *.
 */
exports.getSlots = function () {
    try { 
        const slotApiTimingLogging = Site.getCustomPreferenceValue('slotApiTimingLogging');
        
        let beforeSlotCall = slotApiTimingLogging ? new Date(): null;
        
        const params = request.httpParameters;
        const idsString = params.c_id ? params.c_id.pop() : '';
        const ids = idsString.split(",");
        const categoryId = params.c_categoryId ? params.c_categoryId.pop(): ''; 
        const categoryIdList = categoryId.split(",");
        const productId = params.c_productId ? params.c_productId.pop() : '';
        const slotLimit = Site.getCustomPreferenceValue('slotsEndpointLimitSlots');


        // if both slot and category have more than one throw error
        if (ids.length > 1 && categoryIdList.length > 1) {
            throw new errorHandler.error('GET-SLOTS-01-001');
        }
        
        if (ids.length > slotLimit){
            throw new errorHandler.error('GET-SLOTS-01-002', slotLimit);
        } 
        // Fetch content slots using the provided ids and optional categoryId
        const slotsData = contentSlotAPI.getSlotConfigurations(ids, categoryId, productId); 

        if (slotsData.soonestScheduleChange && Site.getCustomPreferenceValue('dynamicSlotCacheTTL')) {
            var customCacheTime;
            const now = new Date();
            const changeDate = slotsData.soonestScheduleChange;

            //Getting the amount of minutes between now and the next schedule change
            const timeUntilChange = changeDate ? (changeDate - now) / 60000 : null;
        
        
            if (timeUntilChange) {
                if (timeUntilChange < 0) {
                    customCacheTime = 0;
                } else {
                    customCacheTime = timeUntilChange + 1;
                }
                cacheTTLManager.setResponseTTL(customCacheTime);
            }
        } else {
            cacheTTLManager.setResponseTTL();
        }

        if (slotApiTimingLogging) {
            let afterSlotCall = new Date();
            let totalTimeOfSlotsApi = (afterSlotCall - beforeSlotCall) / 1000;
            let totalTimeOfOcapiCalls = slotsData.totalTimeForOcapiCall;

            
            let logString = '';


            logString = logString + 'All OCAPI Calls took a total of ' + (totalTimeOfOcapiCalls ? totalTimeOfOcapiCalls.toFixed(2) : 'N/A') + ' seconds | ';

            let processTime = totalTimeOfSlotsApi - totalTimeOfOcapiCalls;

            logString = logString + 'Total Process time from our code is ' + (processTime ? processTime.toFixed(2) : 'N/A') + ' seconds | ';

            logString = logString + 'Total time for entire slots call is ' + (totalTimeOfSlotsApi ? totalTimeOfSlotsApi.toFixed(2) : 'N/A') + ' seconds';
            let logObject = {};
            logObject.message = logString;

            logHandler.logger.error(logObject, 'CustomAPI', 'SlotApiTiming');
        }



        // Create a successful response with the fetched slots data
        dw.system.RESTResponseMgr.createSuccess ( slotsData ).render();
    } catch (e) {
        // Handle exceptions and create an error response
        apiUtils.createErrorResponse(e);
        logHandler.logger.error(e, 'CustomAPI', 'GetSlot');
    }
};

// Make the API public
exports.getSlots.public = true;
