"use strict";
importPackage(dw.system);
importPackage(dw.util);
const Resource = require('dw/web/Resource');

/**
 * These functions are used for the fulfillment module that displays the cutoff for a specific shipping method to arrive before a set date, i.e. Christmas
 * @namespace FulfillmentModule
 */

const fulfillmentData = {
    fulfillmentCutoffStandard: Resource.msg('fulfillment.standardshipping', 'fulfillment', null),
    fulfillmentCutoffExpedited: Resource.msg('fulfillment.expeditedshipping', 'fulfillment', null),
    fulfillmentCutoffOvernight: Resource.msg('fulfillment.overnightshipping', 'fulfillment', null),
    fulfillmentCutoffPickUpInStore: Resource.msg('fulfillment.pickupinstore', 'fulfillment', null),
    fulfillmentCutoffInstaCart: Resource.msg('fulfillment.instacart', 'fulfillment', null)
};

/**
 * Checks if a string is for the instacart fulfillment method, and if not adds an exclamation point to increase urgency
 *
 * @name makeUrgentString
 * @param {string} str - the string describing the fulfillment method
 * @return {string} - that string with urgency punctuation added or not
 * @memberof FulfillmentModule
 */
function makeUrgentString(str) {
    if (str == "Instacart") {
        return str;
    } else {
        return str + "!";
    }
}

/**
 * Takes the fulfillment cutoff dates from a content asset and builds an array of the fulfillemnt method cards
 *
 * @name FormatData
 * @param {Object} asset - the content asset containing the fulfillment method cutoff dates
 * @return {Object} - object containing the list of current fulfillment methods and countdown to their cutoff
 * @memberof FulfillmentModule
 */
const FormatData = function (asset) {
    let todaysDate = System.getCalendar();
    let returnObject = {
        cardsComponents: [],
        heading: !empty(asset.custom.fulfillmentCutoffHeading)
            ? asset.custom.fulfillmentCutoffHeading
            : "",
        footerHeader: dw.system.Site.current.getCustomPreferenceValue(
            "fulfillmentModuleFooterText"
        ),
        footerLink: dw.system.Site.current.getCustomPreferenceValue(
            "fulfillmentModuleFooterLink"
        ),
        footerLinkText: dw.system.Site.current.getCustomPreferenceValue(
            "fulfillmentModuleFooterLinkText"
        ),
    };

    for (let key in fulfillmentData) {
        if (
            key in asset.custom &&
            asset.custom[key]
        ) {
            let cutoffDate = GetCalendarFromDateTimeAndApplyTimezone(
                asset.custom[key],
                todaysDate.timeZone
            );
            if (todaysDate.before(cutoffDate)) {
                let cardType =
                    returnObject.cardsComponents.length >= 1
                        ? "ds-fulfillment-card-light"
                        : DecideType(todaysDate, cutoffDate);

                if (fulfillmentData[key] == "Instacart") {
                    cardType = "ds-fulfillment-card-feature";
                }

                if (returnObject.cardsComponents.length == 0) {
                    returnObject.cardsComponents.push({
                        epochTimeInMilliseconds: cutoffDate.getTime().getTime(),
                        supportingText: Resource.msg('fulfillment.lastchance', 'fulfillment', null),
                        fulfillmentMethod: makeUrgentString(
                            fulfillmentData[key]
                        ),

                        type: cardType,
                    });
                } else if (returnObject.cardsComponents.length <= 3) {
                    returnObject.cardsComponents.push({
                        epochTimeInMilliseconds: cutoffDate.getTime().getTime(),
                        supportingText: "",
                        fulfillmentMethod: fulfillmentData[key],
                        type: cardType,
                    });
                }
            }
        }
    }
    return returnObject;
};

/**
 * Takes in the cutoff date for a fulfillment method and sets its timezone to the server's time zone
 * 
 * @name GetCalendarFromDateTimeAndApplyTimezone
 * @param {string} dateTimeString 
 * @param {string} timezone 
 * @returns {Object} - Calendar object with time and time zone
 * @memberof FulfillmentModule
 */
function GetCalendarFromDateTimeAndApplyTimezone(dateTimeString, timezone) {
    let cutoffDate = new Calendar(new Date(dateTimeString));
    cutoffDate.timeZone = timezone;
    return cutoffDate;
}

/**
 * Checks to see if the time today meets a certain threshold of urgency, and chooses which card to display
 * 
 * @name DecideType
 * @param {*} todaysDate 
 * @param {*} cutoffDate 
 * @returns {string} - urgent or heavy fulfillment card marker
 * @memberof FulfillmentModule
 */
function DecideType(todaysDate, cutoffDate) {
    if (
        //86400000ms = 24 hours
        cutoffDate.getTime().getTime() - todaysDate.getTime().getTime() <=
        86400000
    ) {
        return "ds-fulfillment-card-urgent";
    } else {
        return "ds-fulfillment-card-heavy";
    }
}

module.exports = {
    fulfillmentData: fulfillmentData,
    FormatData: FormatData,
};