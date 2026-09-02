const strUnavailable = 'UN$AVAILABLE';
const strNotPreference = 'NOT$A$PREFERENCE';
const CustomObjectMgr = require('dw/object/CustomObjectMgr');
const convertAttributeToJSON = require('app_composable/cartridge/scripts/helpers/objects/attributes').convertAttributeToJSON;
const sitePrefHelper = require('app_composable/cartridge/scripts/helpers/util/sitePrefHelper');

/**
 * Functions used in the Custom Site Preference API endpoint
 * @namespace CustomPreferenceAPI 
 */

/**
 * Sends a response detailing that the custom object was not found, with a 500 error code
 * @function CustomObjectNotFoundError
 * @memberof CustomPreferenceAPI
 * @param {string} pref - the name of the custom object that was not found
 */
function CustomObjectNotFoundError(pref) {
    this.name = 'CustomObjectNotFoundError';
    this.message = 'Custom Object Not Found ' + pref;
    this.type = 'https://api.commercecloud.salesforce.com/documentation/error/v1/custom-errors/custom-object-not-found';
    this.httpCode = 500;
}

/**
 * Builds a JSON return value featuring that site preference's name as the key, and its value or an error message as the value
 * @function buildJSONVals
 * @memberof CustomPreferenceAPI
 * @param {string} key - The name of the Site Preference
 * @param {*} value - The value contained in that site preference. Can be multiple types of value, or an error message
 * @returns {object} - The constructed key-value pair
 */
function buildJSONVals(key, value) {

    const returnThis = {
        "key": key,
        "value": value
    }

    return returnThis;
}

/**
 * Checks if the passed in Custom Preference IDs are being allowed through by the allowed site preferences Custom Object, then returns the final list of requested site preferences
 * @function getCustomPreferences
 * @memberof CustomPreferenceAPI
 * @param {string} preferenceRequestParams - The list of custom preference IDs a user wants, or the word "all" to return all of the allowed custom preferences
 * @returns - an object containing an array of the requested site preferences in key-value pairs
 */
exports.getCustomPreferences = function getCustomPreferences(preferenceRequestParams) {
    let returnObj = {};
    let allowList;
    let preferenceRequest = preferenceRequestParams[0].split(',');
    returnObj.data = [];

    try {
        allowList = CustomObjectMgr.getCustomObject('FE-SITE-PREFERENCES', 'default').getCustom().allowList;
    } catch (e) {
        throw new CustomObjectNotFoundError('FE-SITE-PREFERENCES[default]');
    }

    const customHeaders = sitePrefHelper.getCustomHeaders();
    allowList = new Set(Array.prototype.slice.call(allowList));
    allowList.forEach((preference) => {
        if (preferenceRequest[0] === 'all' || allowList.has(preference)) {
            let preferenceObject = sitePrefHelper.getSitePrefValue(preference, customHeaders);
            let value = convertAttributeToJSON(preferenceObject);
            let preferenceData = !empty(value) ? value : strNotPreference;
            returnObj.data.push(buildJSONVals(preference, preferenceData));
        } else {
            returnObj.data.push(buildJSONVals(preference, strUnavailable));
        }
    });

    return returnObj;
}