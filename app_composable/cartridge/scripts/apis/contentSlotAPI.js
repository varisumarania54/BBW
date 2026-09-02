'use strict';
importPackage(dw.system);
const contentHelpers = require('app_composable/cartridge/scripts/helpers/content/contentHelpers.js')
const slotHelpers = require('app_composable/cartridge/scripts/helpers/slot/slotHelpers.js');
const productHelpers = require('app_composable/cartridge/scripts/helpers/objects/product.js');
const ocapiService = require('app_composable/cartridge/scripts/services/OCAPIData.js');
const errorHandler = require('app_composable/cartridge/scripts/helpers/util/errorHandler.js').errorHandler;
const ContentMgr = require('dw/content/ContentMgr');
const System = require('dw/system/System');
const currentSite = dw.system.Site.getCurrent();
const slotApiTimingLogging = currentSite.getCustomPreferenceValue('slotApiTimingLogging');
const visualNavEnabled = currentSite.getCustomPreferenceValue('DisplayVisualNavigation');
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;
const CacheMgr = require('dw/system/CacheMgr');

/**
 * Functions used in the Custom Site Preference API endpoint
 * @namespace ContentSlotApi 
 */

/**
 * Grabs the slots and configures them for the response object
 * @function getSlot
 * @memberof ContentSlotApi
 * @param {Array} slots - the slot ids
 * @param {string} context - category id
 * @param {string} pref - the product id
 * @param {string} token - auth token
 */
function getSlot(slots, context, productId, token) {
  let includeVisualNav = false;
  // don't allow preview for production
  const allowPreview = !(System.getInstanceType() === System.PRODUCTION_SYSTEM);
  

  const contextType = context ? "category" : "global";
  // call ocapi slot service to grab the slot info 

  let beforeOcapiCall = slotApiTimingLogging ? new Date() : null;

  // grab slots from API
  const contentService = slotHelpers.callContentService(slots, context, contextType, token);

  let totalTimeForOcapiCall;

  // logs how long the slot api took to get all the slots. this is for preformance testing
  if (slotApiTimingLogging) {
    let afterOcapiCall = new Date();
    totalTimeForOcapiCall = (afterOcapiCall - beforeOcapiCall) / 1000;

    let timeLimit = 4;

    if (totalTimeForOcapiCall >= timeLimit) {
      
      let logString = 'slot ids = ' + slots.join(',') + ' took over ' + timeLimit + ' seconds to come back. It took ' + totalTimeForOcapiCall + ' seconds.';
      if (contentService && contentService.errorMessage) {
        logString = logString + " | There is also an error message from the response of trying to retrieve this slot -> " + contentService.errorMessage;
      }
      let logObject = {};
      logObject.message = logString;
      logHandler.logger.info(logObject, 'CustomAPI', 'SlotOcapiTiming');
    }
  }

  let soonestEndDate;
  let soonestStartDate;
  // grab the customer groups
  const customerGroups = customer.customerGroups.toArray().map(e => e.ID);
  // grab library 
  const libraryId = ContentMgr.getSiteLibrary().ID
  // this is the preview date if its set
  let shopperContextDate = dw.customer.CustomerContextMgr.getEffectiveTime(); 
  let response = [];
  // filter out all non active slots and check if preview is enabled then filter out all non active slots to that date. return active slots
  let slotConfigs =
    contentService ?
      contentService.filter(
        (element) => {
          if (empty(element)) {
            return false;
          }
          // grab the soonest date for a slot config's schedule is in order to update the dynamic cache TTL
          if (element.assignment_information && element.assignment_information.enabled) {
            soonestStartDate = slotHelpers.getSoonestChangeDate(element, soonestStartDate, 'start_date')
          }
          // if there is a schedule no preview and no customer group
          if (element.assignment_information.enabled) {
            if (element.schedule && !shopperContextDate && !element.customer_groups) {
              return true;
            }
            // if there is a schedule no preview and there is a customer group
            if (element.schedule && !shopperContextDate && element.customer_groups) {
              return slotHelpers.checkIfCustomerGroupsMatch(element.customer_groups || null, customerGroups)
            }
            // start of preview logic to see if the slots are active against the preview date
            if (allowPreview && shopperContextDate && slotHelpers.checkSlotSchedule(element, shopperContextDate)) {
              // there is a schedule setup on the slot
              if (element.schedule) {
                // there is a customer group also setup for the slot but doesn't match
                if(element.customer_groups && !slotHelpers.checkIfCustomerGroupsMatch(element.customer_groups || null, customerGroups)){
                  return false;
                }
                // check if the default schedule is active
                let startDate = element.schedule.start_date ? new Date(element.schedule.start_date) : new Date(0);
                let endDate =  element.schedule.end_date ? new Date(element.schedule.end_date) : new Date(8640000000000000);
                if(startDate <= shopperContextDate && shopperContextDate <= endDate){
                  return true;
                }
              }
              // are there active campaigns schedules
              if (element.assignment_information.active_campaign_assignments) {
                // check customer group on the active campaigns
                return slotHelpers.checkIfCustomerGroupsMatch(element.assignment_information.active_campaign_assignments[0].customer_groups || null, customerGroups);
                // default schedules and does the default have a customer group
              } else if (element.customer_groups) {
                // if it does then check if the default customer group is valid
                return slotHelpers.checkIfCustomerGroupsMatch(element.customer_groups || null, customerGroups);
                // upcoming campaign schedules 
              } else if (element.assignment_information.upcoming_campaign_assignments) {
                let upcomingGroups = true;
                for (let i = 0; i < element.assignment_information.upcoming_campaign_assignments.length; i++) {
                  // do the upcoming campaigns have customer groups
                  if (element.assignment_information.upcoming_campaign_assignments[i].customer_groups) {
                    upcomingGroups = false; 
                    // check all upcoming campaigns if they match the customer group
                    if (slotHelpers.checkIfCustomerGroupsMatch(element.assignment_information.upcoming_campaign_assignments[i].customer_groups || null, customerGroups)) {
                      upcomingGroups = true;
                    }
                  }
                }
                return upcomingGroups
                // does a default campaign (parent) exist
              } else if (element.assignment_information && element.assignment_information.schedule_type == "campaign") {
                // check if the default campaign (parent) have customer groups
                  return slotHelpers.checkIfCustomerGroupsMatch(element.customer_groups || null, customerGroups);
              } else if (element.assignment_information.schedule) {
                // check the past preview campaign dates to see if its active
                let startDate = element.assignment_information.schedule.start_date ? new Date(element.assignment_information.schedule.start_date) : new Date(0);
                let endDate =  element.assignment_information.schedule.end_date ? new Date(element.assignment_information.schedule.end_date) : new Date(8640000000000000);
                if(startDate <= shopperContextDate && shopperContextDate <= endDate){
                  return true;
                }
              }
              return false;
            }
            // is there a default campaign setup and no preview
            if (element.schedule && !shopperContextDate) {
              // check the default parent campaign for customer group
              if(element.customer_groups && !slotHelpers.checkIfCustomerGroupsMatch(element.customer_groups || null, customerGroups)){
                return false;
              }
              // make sure dates are matching todays
              let startDate = element.schedule.start_date ? new Date(element.schedule.start_date) : new Date(0);
              let endDate =  element.schedule.end_date ? new Date(element.schedule.end_date) : new Date(8640000000000000);
              let nowDate = new Date();
              if(startDate <= nowDate && nowDate <= endDate){
                return true;
              }
            }
            // is there active campaigns setup and no preview
            if (element.assignment_information.active_campaign_assignments && !shopperContextDate) {
              if (element.assignment_information.active) {
                // check the active campaign customer group
                return slotHelpers.checkIfCustomerGroupsMatch(element.assignment_information.active_campaign_assignments[0].customer_groups || null, customerGroups)
              }
            }
          return false;
        }
      }
      ) : [];

  let slotConfig;
  let slotContent;
  let activeCampaignAssignments;
  let productConfig;
  let custom;
  let emptyVisNav;
  // if its a category slot then only grab the ones that match the passed category id
  if (slotConfigs.length !== 0 && contextType == 'category') { // check if category request 
    let slotsArray = [];
    let validSlots = [];
    // push the multiple category slots to an array
    let categoriesArray = context.split(',').map(function (category) {
      return category.trim();
    });

    if (categoriesArray.length > 1) {
      slotsArray = slotHelpers.groupByCategoryId(slotConfigs)
    } else {
      slotsArray = slotHelpers.groupBySlotId(slotConfigs)
    }
 
    
    // setup the response with functions for each category
    for (let config in slotsArray) {
      // null check
      if (slotsArray[config].length > 0 && !empty(slotsArray[config])) {
        slotConfig = slotHelpers.getHighestRankedConfig(slotsArray[config], shopperContextDate);
        // null check
        if (slotConfig) {
          // grab custom attributes that are allowed to show
          custom = slotHelpers.getSlotConfigCustomAttributes(slotConfig);
          let templateName = slotConfig ? slotConfig.template : 'no template found';
          switch (templateName) {
            case 'slots/category/visual-navigation.isml': {
              if (visualNavEnabled) includeVisualNav = true;
            }
            // grab content assets
            default: {
              slotContent = slotHelpers.getSlotContent(slotConfig, libraryId, token);
              if (slotConfig && slotConfig.slot_content && slotConfig.slot_content.product_ids) {
                productConfig = productHelpers.getProductContent(slotConfig.slot_content.product_ids);
              }
            }
          }
          // grab the active assignments
          activeCampaignAssignments = contentHelpers.getActiveCampaignAssignment(slotConfig);
            // create response object
          response.totalTimeForOcapiCall = totalTimeForOcapiCall;
          // Finds what the soonest change date for a slot config's schedule is in order to update the dynamic cache TTL
          soonestEndDate = slotHelpers.getSoonestChangeDate(slotConfig, soonestEndDate, 'end_date');
          // create the response for category slot
          let responseObj = {
            slot_id: slotConfig.slot_id,
            category_id: slotConfig ? slotConfig.context_id : null,
            slot_config_id: slotConfig ? slotConfig.configuration_id : null,
            template: slotConfig ? slotConfig.template : null,
            custom: custom,
            products: productConfig,
            emailConfig: slotHelpers.getEmailDialogConfigurations(slotConfig),
            pwaPageSupression: slotHelpers.getPwaPageSupression(slotConfig),
            rank:
              activeCampaignAssignments && activeCampaignAssignments.rank
                ? activeCampaignAssignments.rank
                : 100,
          callout: slotConfig && slotConfig.callout_msg ? slotConfig.callout_msg.default.markup : null,
            visual_nav_tiles:
              includeVisualNav
                ? (contentHelpers.buildVisNavTiles(slotConfig && slotConfig.slot_content && slotConfig.slot_content.category_ids ? slotConfig.slot_content.category_ids : null, categoriesArray[config]))
                : emptyVisNav
          }
          // Conditionally add contentAssets if slotContent has items
          if (!empty(slotContent)) {
            let onlineSlotContent = slotHelpers.filterOutOfflineContentAssets(slotContent, slotConfig);
            if (!empty(onlineSlotContent)) {
              responseObj.contentAssets = onlineSlotContent;
            }    
          }
          response.push(responseObj);
          validSlots.push(slotConfig.slot_id)
        } 
      } else {
          response.totalTimeForOcapiCall = totalTimeForOcapiCall;
          response.push({
            slot_id: slots,
            errorMessage: "no active slots returned"
          });
        }
      }
      // handle invalid slots
      const invalidSlots = slots.filter(slot => !validSlots.includes(slot));
      if (invalidSlots.length > 0) {
        invalidSlots.forEach(slot => {
        response.push({
            slot_id: slot,
            category_id: null,
            slot_config_id: null,
            template: null,
            pwaPageSupression: null,
            emailConfig: null,
            callout: null,
            rank: null
          })
        });
      }
  } else if (slotConfigs.length !== 0 && contextType !== 'category') { // if its not category run normal logic
    if (productId) {
      slotConfigs = productHelpers.getProductBanner(slotConfigs, productId)
      if (slotConfigs.length === 0) {
    	throw new errorHandler.error('GET-SLOTS-01-003');
      }
    }
    let slotObjects = {};
    // Loop over slots array and populate each slot's array dynamically
    slots.forEach(slot => {
      slotObjects[slot] = slotConfigs.filter(config => config["slot_id"] === slot);
      if (empty(slotObjects[slot])) {
        slotObjects[slot] = [];
      }
    });

    // Iterate through each slot and process the configs
    for (let currentSlot in slotObjects) {
      slotConfigs = slotObjects[currentSlot];

      // If slotConfigs is not empty, we can proceed
      if (slotConfigs.length > 0) {
        let slotConfig = slotHelpers.getHighestRankedConfig(slotConfigs, shopperContextDate);
        let custom = slotHelpers.getSlotConfigCustomAttributes(slotConfig);
        let slotContent = slotHelpers.getSlotContent(slotConfig, ocapiService, libraryId, token);
        let productConfig = null;
        if (slotConfig && slotConfig.slot_content && slotConfig.slot_content.product_ids) {
          productConfig = productHelpers.getProductContent(slotConfig.slot_content.product_ids);
        }
        // Get active campaign assignments
        let activeCampaignAssignments = contentHelpers.getActiveCampaignAssignment(slotConfig);


        // Create the response object for this slot
        response.totalTimeForOcapiCall = totalTimeForOcapiCall;
        soonestEndDate = slotHelpers.getSoonestChangeDate(slotConfig, soonestEndDate, 'end_date')
        // create response object
        let responseObj = {
          slot_id: currentSlot, 
          slot_config_id: slotConfig ? slotConfig.configuration_id : null,
          template: slotConfig ? slotConfig.template : null,
          products: productConfig,
          emailConfig: slotHelpers.getEmailDialogConfigurations(slotConfig),
          pwaPageSupression: slotHelpers.getPwaPageSupression(slotConfig),
          rank: activeCampaignAssignments && activeCampaignAssignments.rank ? activeCampaignAssignments.rank : 100,
          callout: slotConfig && slotConfig.callout_msg ? slotConfig.callout_msg.default.markup : null,
          custom: custom
        }
        // Conditionally add contentAssets if slotContent has items
        if (!empty(slotContent)) {
          let onlineSlotContent = slotHelpers.filterOutOfflineContentAssets(slotContent, slotConfig);
          if (!empty(onlineSlotContent)) {
            responseObj.contentAssets = onlineSlotContent;
          }           
        }
        response.push(responseObj);
      } else {
        response.totalTimeForOcapiCall = totalTimeForOcapiCall;
        // no slot configs found
        response.push({
          slot_id: currentSlot,
          slot_config_id: null,
          template: null,
          pwaPageSupression: null,
          emailConfig: null,
          callout: null,
          rank: null
        })
      }
    }

  } else if (slots) {
    for (let slot in slots) {
      // if no slot configs found
      response.totalTimeForOcapiCall = totalTimeForOcapiCall;
      response.push({
        slot_id: slots[slot],
        slot_config_id: null,
        template: null,
        emailConfig: null,
        pwaPageSupression: null,
        callout: null,
        rank: null
      });
    }
  } else {
    // if category id and slots don't match
	  throw new errorHandler.error('GET-SLOTS-01-004');
  }
  // setup the soonest date for changing slots in order to update the dynamic cache TTL
  if (!empty(soonestStartDate) && !empty(soonestEndDate)) {
    response.soonestScheduleChange = (soonestStartDate < soonestEndDate) ? soonestStartDate : soonestEndDate;
  } else if (!empty(soonestStartDate)) {
      response.soonestScheduleChange = soonestStartDate;
  } else if (!empty(soonestEndDate)) {
      response.soonestScheduleChange = soonestEndDate;
  }
  return response;
}

exports.getSlotConfigurations = function getSlotConfigurations(ids, categoryId, productId) {
  let cache = CacheMgr.getCache('ocapiDataOAuthToken');
  const token =  cache.get( currentSite.ID + "ocapiDataToken", function generateNewToken() 
    {
      const authResult =  ocapiService.GetOAuth.call();
      if (authResult.error){
        let logObject = {
          message: 'Slot Search OCAPI token error. Code: ' + authResult.error + ' Message: ' + authResult.errorMessage
        }
        logHandler.logger.error(logObject, 'CustomAPI', 'OCAPIService')
        throw new errorHandler.error('GET-SLOTS-02-001')
      }
      return authResult.object.access_token;
    }
  );

  return getSlot(ids, categoryId, productId, token)
}
