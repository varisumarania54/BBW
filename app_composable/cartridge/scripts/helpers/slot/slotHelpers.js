'use strict'
importPackage(dw.system);
const Site = require('dw/system/Site').getCurrent();
const System = require('dw/system/System');
const ocapiService = require('app_composable/cartridge/scripts/services/OCAPIData.js');
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;
const errorHandler = require('app_composable/cartridge/scripts/helpers/util/errorHandler.js').errorHandler;
const PromotionMgr = require('dw/campaign/PromotionMgr');
const dates = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

/**
 * @namespace SlotHelper
 */

/**
 * Grab the HTML from slot
 * @function getSlotHtml
 * @memberof SlotHelper
 * @param {object} slotConfig - the slot configuration
 */
function getSlotHtml(slotConfig){
    let slotHtml = [];

    if(slotConfig.slot_content && slotConfig.slot_content.body){
        slotHtml.push({ "c_body": slotConfig.slot_content.body });
    }
    return slotHtml;
}

/**
 * get list of recommendations from Einstein API
 * @function getSlotRecommendations
 * @memberof SlotHelper
 * @param {object} slotConfig - the slot configuration
 */
function getSlotRecommendations(slotConfig) {
    const Einstein = require('app_composable/cartridge/scripts/services/Einstein.js');
    // grab callout messages
    let recommenderName = slotConfig.callout_msg && slotConfig.callout_msg.default && slotConfig.callout_msg.default.markup;

    // call einstein to get recommendation names
    let recommendationsResponse = Einstein.getRecommendations.call({
        recommenderName
    });
    // check for successful einstein response
    let recommendations = recommendationsResponse.ok && recommendationsResponse.object;

    // if successful add recommended products and UUIDs
    if (recommendations) {
        let productIds = recommendations.recs && recommendations.recs.map(rec => rec.id);
        slotConfig.slot_content.product_ids = productIds;
        slotConfig.slot_content.recoUUID = recommendations.recoUUID;
    }
    // return slots with recommentations
    return slotConfig;
}

/**
 * check to see what type the slot is and then grab the appropriate function for the slot content
 * @function getSlotContent
 * @memberof SlotHelper
 * @param {object} slotConfig - the slot configuration
 * @param {string} libraryId - the libray id
 * @param {string} token - the auth token
 */
function getSlotContent(slotConfig, libraryId, token){
    const contentHelpers = require('app_composable/cartridge/scripts/helpers/content/contentHelpers.js');
    const productHelpers = require('app_composable/cartridge/scripts/helpers/objects/product.js');
    let slotContent = [];
    let contentType = slotConfig && slotConfig.slot_content && slotConfig.slot_content.type;
    // grab correct content based off the content type of slot
    switch (contentType) {
        case "products":
        slotContent = productHelpers.getProductContentAssets(slotConfig, libraryId, token);
        break;
        case "categories":
        break;
        case "content_assets":
        slotContent = contentHelpers.getContentAssets(slotConfig, libraryId, token);
        break;
        case "html":
        slotContent = getSlotHtml(slotConfig);
        break;
        case "recommended_products":
        slotConfig = getSlotRecommendations(slotConfig);
        break;
        default:
        break;
    }
    return slotContent;
}

/**
 * find the highest ranking slot config and return it
 * @function getHighestRankedConfig
 * @memberof SlotHelper
 * @param {object} slotConfig - the slot configuration
 */
function getHighestRankedConfig(slotConfigs, shopperContextDate) {
  if (!slotConfigs || slotConfigs.length === 0) {
    return null;
  }

  // first check which slots have active schedules before checking the ranks of each
  const cleanedSlotConfig = checkSlotSchedule(slotConfigs, shopperContextDate);

  // all slots are inactive end call
  if (empty(cleanedSlotConfig)) {
    let logObject = {
      message: 'Slot Search: No Active slots found when getting running getHighestRankedConfig'
    };

    logHandler.logger.info(logObject, 'CustomAPI', 'SlotService');
    return null;
  }

  // if there is only 1 active show that. don't need to check its rank
  if (cleanedSlotConfig.length === 1) {
    return cleanedSlotConfig[0];
  }

  // grab the preview date if not present then grab today's date
  const customDate = shopperContextDate ? new Date(shopperContextDate) : new Date();

  return cleanedSlotConfig.reduce((prev, current) => {
    const finalPrevRank = getFinalRank(prev, customDate);
    const finalCurrentRank = getFinalRank(current, customDate);

    return finalPrevRank < finalCurrentRank ? prev : current;
  });
}

/**
 * Gets the final rank for a slotConfig considering active campaigns and default schedule
 * @function getFinalRank
 * @memberof SlotHelper
 * @param {Object} slot - The slotConfig object
 * @param {Date} customDate - Date for checking schedules
 */
function getFinalRank(slot, customDate) {
  const activeRank = getActiveCampaignRank(slot, customDate);
  const defaultRank = getDefaultScheduleRank(slot, customDate);

  // return final rank of the slot
  return Math.min(activeRank, defaultRank);
}

/**
 * Gets the lowest numbered rank (technically highest priority) from active or upcoming campaigns
 * @function getActiveCampaignRank
 * @memberof SlotHelper
 * @param {Object} slot - Slot config
 * @param {Date} customDate - shopper context date
 */
function getActiveCampaignRank(slot, customDate) {
  let activeAssignments = [];

  // check if slot has campaigns assigned to it
  if (slot.assignment_information) {
    // check if it has a future campaign assigned to it
    if (slot.assignment_information.upcoming_campaign_assignments) {
      activeAssignments = filterActiveAssignments(slot.assignment_information.upcoming_campaign_assignments, customDate);
      // check if there is an active campaign assigned to it
    } else if (slot.assignment_information.active_campaign_assignments) {
      activeAssignments = filterActiveAssignments(slot.assignment_information.active_campaign_assignments, customDate);
    }
  }
  // check if any active assignments returned
  if (activeAssignments.length > 0) {
    // return the highest rank
    return activeAssignments.reduce((minRank, assignment) => {
      const rank = assignment.rank || 100;
      return rank < minRank ? rank : minRank;
    }, 100);
  }

  // or else return the lowest rank
  return 100;
}

/**
 * Gets the default schedule rank for a slot
 * @function getDefaultScheduleRank
 * @memberof SlotHelper
 * @param {Object} slot - Slot config
 * @param {Date} customDate - shopper context date
 */
function getDefaultScheduleRank(slot, customDate) {
  // check if the default schedule is an active one first then grab its rank
  if (slot.schedule && slot.schedule.start_date && slot.schedule.end_date) {
    const startDate = new Date(slot.schedule.start_date);
    const endDate = new Date(slot.schedule.end_date);

    // if its active return the slot rank or else return lowest rank
    if (startDate <= customDate && customDate <= endDate) {
      return slot.rank || 100;
    }
  }

  // or else return lowest rank
  return 100;
}

/**
 * Filter to see if there is an active campaign assignment for this slot* 
 * @function filterActiveAssignments
 * @memberof SlotHelper
 * @param {Array} assignments - List of assignment objects
 * @param {Date} customDate
 */
function filterActiveAssignments(assignments, customDate) {
  // check to see if there is any active campaign assignments for the slot 
  return assignments.filter(function(assignment) {
    // grab the campaign information since sometimes its missing
    const campaign = PromotionMgr.getCampaign(assignment.campaign_id);
    const startDate = campaign.startDate ? new Date(campaign.startDate) : new Date(0);
    const endDate = campaign.endDate ? new Date(campaign.endDate) : new Date(8640000000000000);

    // is it active against the preview date or todays date
    return startDate <= customDate && customDate <= endDate;
  });
}
/**
 * Looks for custom attributes on the slot configuration, sees if they are allowed to be included in the response, and build an object with them if so
 * @function getSlotConfigCustomAttributes
 * @memberof SlotHelper
 * @param {object} slotConfig - the slot configuration
 * @returns the list of allowed custom attributes
 */
function getSlotConfigCustomAttributes(slotConfig) {
  // if empty end
  if(empty(slotConfig)) {
    return null;
  }

  let convertAttributeToJSON = require('app_composable/cartridge/scripts/helpers/objects/attributes.js').convertAttributeToJSON;
  let allowedAttrList = Site.getCustomPreferenceValue('allowedSlotConfigAttributes');
  let customAttributeIds = Object.keys(slotConfig).filter(key => key.includes('c_'));
  let customAttributes = {};

  // check if there are allowed custom attributes setup in BM
  if (allowedAttrList && customAttributeIds) {
    // only allow the allowed list to be shown, cut out others. If you need a custom attribute to show look at the site pref allowedSlotConfigAttributes
    customAttributeIds.forEach(id => {
      let slicedId = id.slice(2)
      if (allowedAttrList.includes(slicedId)) {
        customAttributes[slicedId] = convertAttributeToJSON(slotConfig[id])
      }
    })
  }

  return customAttributes;
}

/**
 * check the customer group and return boolean value
 * @function customerGroupCheck
 * @memberof SlotHelper
 * @param {array} slotGroups - array of slots
 * @param {array} customerGroups - array of the customer groups
 */
function customerGroupCheck(slotGroups, customerGroups) {
  for (let i = 0; i < slotGroups.length; i++){
    if(customerGroups.indexOf(slotGroups[i]) != -1 ){
      return true;
    }
  }
  return false;
}

/**
 * grab email dialog configurations from the slot
 * @function getEmailDialogConfigurations
 * @memberof SlotHelper
 * @param {object} slot - the slot configuration
 */
function getEmailDialogConfigurations(slot) {
  //check if it has custom data for the email dialog supression if it does return it into the emailConfigs attribute in response
  if (slot && slot.c_cookieDuration && slot.c_cookieName && slot.c_emailDialogPageSuppression) {
    return {
      cookieDuration : slot.c_cookieDuration,
      cookieName : slot.c_cookieName,

      emailDialogPageSuppression : slot.c_emailDialogPageSuppression.split('|')
    }
  }

  return null;
}

/**
 * turn the c_pwaPageSuppression custom attribute from a comma separated list into an array
 * @function getPwaPageSupression
 * @memberof SlotHelper
 * @param {object} slot - the slot configuration
 */
function getPwaPageSupression(slot) {
  // check if it has custom pwa page supression and return if it does
  if (slot && slot.c_pwaPageSuppression) {
    return  slot.c_pwaPageSuppression.split(',')
  }

  return null;
}

/**
 * check the schedule of the slots to grab the active one
 * @function checkSlotSchedule
 * @memberof SlotHelper
 * @param {array} slotConfigs - the slots that are configured
 * @param {string} shopperContextDate - dw.customer.CustomerContextMgr.getEffectiveTime();
 */
function checkSlotSchedule(slotConfigs, shopperContextDate) {
  // if preview date or today's date if preview is not there
  const customDate = shopperContextDate ? new Date(shopperContextDate) : new Date();
  // change all the configs to an array to simplify schedule logic. sometimes its not an array
  const slots = Array.isArray(slotConfigs) ? slotConfigs : [slotConfigs];

  // filter out all inactive slots
  return slots.filter(function(slot) {
    // 1. if active and no shopperContextDate
    if (slot.assignment_information && slot.assignment_information.active && !shopperContextDate) {
      return true;
    }

    // 2. If no schedule, no assignment schedule, and schedule type is 'none' return false
    if (!slot.schedule && !(slot.assignment_information && slot.assignment_information.schedule) && (!slot.assignment_information || slot.assignment_information.schedule_type === 'none')) {
      let logObject = {
        message: 'Slot Search | slotHelpers.js | checkSlotSchedule | No schedule found for' + slot
      };
  
      logHandler.logger.info(logObject, 'CustomAPI', 'SlotService');
      return false;
    }

    // 3. Check for active campaigns on the slot
    if (slot.assignment_information) {
      if (slot.assignment_information.active_campaign_assignments &&
          isCampaignActive(slot.assignment_information.active_campaign_assignments, customDate)) {
        return true;
      }

      // 4. Check for upcoming campaigns on the slot
      if (slot.assignment_information.upcoming_campaign_assignments) {
        const multipleAssignments = slot.assignment_information.upcoming_campaign_assignments;
        // filter out any inactive slot in the upcoming campaigns against the date. Used for preview mainly
        const activeSlots = multipleAssignments.filter(function(element) {
          const campaign = PromotionMgr.getCampaign(element.campaign_id);
          const campaignStart = (element.schedule && element.schedule.start_date)
          ? new Date(element.schedule.start_date)
          : campaign.startDate ? new Date(campaign.startDate) : new Date(0);
          const campaignEnd = (element.schedule && element.schedule.end_date)
          ? new Date(element.schedule.end_date)
          : campaign.endDate ? new Date(campaign.endDate) : new Date(8640000000000000);
          return campaignStart <= customDate && customDate <= campaignEnd;
        });
        if (activeSlots.length > 0) {
          return true;
        }
      }
    }

    // 5. Check recurrence for individual days. some slots can have individual days setup
    const recurrence = (slot.schedule && slot.schedule.recurrence) 
                        ? slot.schedule.recurrence 
                        : (slot.assignment_information && slot.assignment_information.schedule && slot.assignment_information.schedule.recurrence)
                          ? slot.assignment_information.schedule.recurrence
                          : null;

    if (recurrence && recurrence.day_of_week) {
      const slotDay = dates[customDate.getDay() - 1];
      if (recurrence.day_of_week.indexOf(slotDay) === -1) {
        return false;
      }
    }

    // 6. Check default schedules for the slot
    let startDate;
    let endDate;
    if (slot.schedule) {
      startDate = slot.schedule.start_date ? new Date(slot.schedule.start_date) : new Date(0);
      endDate = slot.schedule.end_date ? new Date(slot.schedule.end_date) : new Date(8640000000000000);
      if (startDate <= customDate && customDate <= endDate) {
        return true;
      }
    }

    // 7. Check assignment_information schedule dates. this is schedules setup on the parent campaign
    if (slot.assignment_information && slot.assignment_information.schedule_type !== 'none' && slot.assignment_information.schedule_type !== 'multiple') {
      startDate = (slot.assignment_information.schedule && slot.assignment_information.schedule.start_date)
        ? new Date(slot.assignment_information.schedule.start_date)
        : (slot.assignment_information.start_date)
          ? new Date(slot.assignment_information.start_date)
          : new Date(0);

      endDate = (slot.assignment_information.schedule && slot.assignment_information.schedule.end_date)
        ? new Date(slot.assignment_information.schedule.end_date)
        : (slot.assignment_information.end_date)
          ? new Date(slot.assignment_information.end_date)
          : new Date(8640000000000000);

      if (startDate <= customDate && customDate <= endDate) {
        return true;
      }
    }

    // if no active slots are found log. incorrect call or nothing active
    if (slot && slot.slot_id) {
      let logObject = {
        message: 'Slot Search | slotHelpers.js | checkSlotSchedule | No active schedules found for ' + slot.slot_id
      };

      logHandler.logger.info(logObject, 'CustomAPI', 'SlotService');
    }

    
    // 8. if all else fails return false
    return false;
  });
}

/**
 * Checks if any campaign assignment is active for a given date
 */
function isCampaignActive(assignments, date) {
  for (let i = 0; i < assignments.length; i++) {
    const assignment = assignments[i];
    // grab campaign from slot incase missing
    const campaign = PromotionMgr.getCampaign(assignment.campaign_id);
    // check dates to see if the campaign has an active date
    const campaignStart = (assignment.schedule && assignment.schedule.start_date)
      ? new Date(assignment.schedule.start_date)
      : (campaign.startDate)
        ? new Date(campaign.startDate)
        : new Date(0);

    const campaignEnd = (assignment.schedule && assignment.schedule.end_date)
      ? new Date(assignment.schedule.end_date)
      : (campaign.endDate)
        ? new Date(campaign.endDate)
        : new Date(8640000000000000);

    if (campaignStart <= date && date <= campaignEnd) {
      return true;
    }
  }
  return false;
}

/**
 * Checks if the customer groups on the session's customer match the groups on the slot config's campaign
 * @function checkIfCustomerGroupsMatch
 * @memberof SlotHelper
 * @param {Array} campaignCustomerGroups
 * @param {Array} customerCustomerGroups
 */
function checkIfCustomerGroupsMatch(campaignCustomerGroups, customerCustomerGroups) {
  // no customer groups then send true
  if (!campaignCustomerGroups) {
    return true;
    // if there is a customer group check against to see if its valid
  } else if (customerGroupCheck(campaignCustomerGroups, customerCustomerGroups)) {
    return true;
  }
  // don't show slot if its not in the customer group
  return false;
}

/**
 * Calls the Slot Congfiguration Search OCAPI service to get slot configs for the given slots and context, and recuresively calls it if over 200 configs are found
 * @function callContentService
 * @memberof SlotHelper
 * @param {*} slot - the slot ids we are searching for
 * @param {*} context - the category ids we want to search for a slot in
 * @param {*} contextType - "category" or "global" based on what type of config search it is
 * @param {*} token - OCAPI auth token
 * @param {Number} start - the starting index of the search, for pagination. the first search is always 0, and it increases by 200 for each page of results
 * @param {Array} slotConfigArray - the final array of results. added to recursively if there are more than 200 results
 * @returns the list of all enabled slot configs matching the given ids
 */
function callContentService(slot, context, contextType, token, start, slotConfigArray) {
  !start ? start = 0 : null;
  !slotConfigArray ? slotConfigArray = [] : null;

  // call the ocapi slots call to get all the slots
  let contentServiceResult = ocapiService.slotSearch.call({
    token: token,
    slots: slot,
    contextType: contextType,
    host: System.instanceHostname,
    context: context ? context : null,
    start: start,
    siteId: Site.ID
  });

  // if its empty or errored then end
  if (!contentServiceResult.isOk() || contentServiceResult.status === 'ERROR') {
    let logObject = {
      message: 'Slot Search OCAPI call error. Please check OCAPI service logs | slot: ' + slot + '| contextType: ' + contextType + '| context: ' + (context ? context : null) + '| start: ' + start + '| contentServiceResult: ' + contentServiceResult
    };

    logHandler.logger.error(logObject, 'CustomAPI', 'SlotService');
    throw new errorHandler.error('GET-SLOTS-02-001');
  }

  // concatenate the current results to the slot config array
  slotConfigArray = slotConfigArray.concat(contentServiceResult.object.hits);

  // if there are more results, make a recursive call to fetch the next set
  if (contentServiceResult.object.total > (start + 200)) {
      return callContentService(slot, context, contextType, token, start + 200, slotConfigArray);
  } else {
      // if all results are fetched, return the final array
      return slotConfigArray;
  }
}

/**
 * groups the slots with the correct slot id and category
 * @function groupBySlotId
 * @memberof SlotHelper
 * @param {array} slotConfigs - the slots we're looking for
 * @returns the slots in the correct grouping
 */
function groupBySlotId(slotConfigs) {
  // filter through the configs and group them in an array of arrays based off slot_id
  const groupedBySlotId = slotConfigs.reduce((acc, config) => {
    const { 'slot_id': slotId } = config;
    if (!acc[slotId]) {
      acc[slotId] = [];
    }
    acc[slotId].push(config);
    return acc;
  }, {});

  const result = Object.values(groupedBySlotId);
  return result;
}

/**
 * Finds what the soonest change date for a slot config's schedule is in order to update the dynamic cache TTL
 * @function getsoonestChangeDate
 * @param {*} slotConfig 
 * @param {*} soonestChangeDate 
 * @param {String} startOrEnd - start_date or end_date, determines whether we are claculation the soonest start or end date
 * @returns the soonest date of the start of the slot config's schedule
 */
function getSoonestChangeDate(slotConfig, soonestChangeDate, startOrEnd) {
  // check if slot has a parent campaign assigned with dates
  if (slotConfig && slotConfig.assignment_information && slotConfig.assignment_information[startOrEnd]) {
    let slotChangeDate = new Date(slotConfig.assignment_information[startOrEnd]);
    if (!soonestChangeDate || slotChangeDate < soonestChangeDate){
      if (slotChangeDate > new Date()){
        soonestChangeDate = slotChangeDate;
      }
    }
  }
  //   // check if slot has a campaign assigned with dates
  if (slotConfig && slotConfig.assignment_information && slotConfig.assignment_information.schedule && slotConfig.assignment_information.schedule[startOrEnd]){
    let slotChangeDate = new Date(slotConfig.assignment_information.schedule[startOrEnd]);
    if (!soonestChangeDate || slotChangeDate < soonestChangeDate){
      if (slotChangeDate > new Date()){
        soonestChangeDate = slotChangeDate;
      }
    }
  }
  return soonestChangeDate;
}

/**
 * groups the slots with the correct category id
 * @function groupByCategoryId
 * @memberof SlotHelper
 * @param {array} slotConfigs - the slots we're looking for
 * @returns the slots in the correct grouping
 */
function groupByCategoryId(slotConfigs) {
  // filter through the configs and group them in an array of arrays based off slot_id
  const groupedByCategoryId = slotConfigs.reduce((acc, config) => {
    const { 'context_id': contextId } = config;
    if (!acc[contextId]) {
      acc[contextId] = [];
    }
    acc[contextId].push(config);
    return acc;
  }, {});

  const result = Object.values(groupedByCategoryId);
  return result;
}


/**
 * filter out any content assets that are offline
 * @function filterOutOfflineContentAssets
 * @memberof SlotHelper
 * @param {array} slotContent - slot content to filter by
 * @param {array} slotConfig - The specific slot configuration
 * @returns the slots in the correct grouping
 */
function filterOutOfflineContentAssets(slotContent, slotConfig) {
  let onlineSlotContent = slotContent.filter(e => (e != null && (e._type != 'content_asset' || (e._type == 'content_asset' && e.online && e.online.default))));
  if (slotContent.some(e => e == null) && slotConfig) {
      let logObject = {
        message: 'There is a configuration issue with slot ID = "' + slotConfig.slot_id + '" with configuration ID = "' + slotConfig.configuration_id + '". This slotID/configuration will not return any data and will not render on the front end.'
      };
  
      logHandler.logger.error(logObject, 'CustomAPI', 'SlotService');
  }
  return onlineSlotContent;
}

module.exports = {
    getSlotContent,
    getHighestRankedConfig,
    customerGroupCheck,
    getEmailDialogConfigurations,
    getPwaPageSupression,
    getSlotConfigCustomAttributes,
    checkSlotSchedule,
    checkIfCustomerGroupsMatch,
    callContentService,
    groupBySlotId,
    getSoonestChangeDate,
    groupByCategoryId,
    filterOutOfflineContentAssets
}
