const apiUtils = require('app_composable/cartridge/scripts/apiUtils.js');
const scapiService = require('app_composable/cartridge/scripts/services/SCAPI.js');
const AdobeTargetServiceInit = require('int_adobetarget/cartridge/scripts/adobeTargetServiceInit.js');
const Site = require('dw/system/Site');
const Status = require('dw/system/Status');
const AdobeTrackingServer = Site.getCurrent().getCustomPreferenceValue('AdobeTargetTrackingServer');

/**
 * Functions used in the Adobe Helper
 * @namespace AdobeHelper
 */


/**
 * Call the ECID service if there is no 'mcmid' value set in Session
 * Used in Adobe Target implementation - BBWDP-5660, BBWDP-5661
 * @function setMCMIDFromAPI
 * @returns {mcmid} Returns mcmid value from api 
 */
function setMCMIDFromAPI() {
    const ecidRes = AdobeTargetServiceInit.ECID.call();
    if ('d_mid' in ecidRes.object && !empty(ecidRes.object.d_mid)) {
        return ecidRes.object.d_mid;
    }
}

/**
 * Call the Delivery API once we have a 'mcmid' set in Session
 * Used in Adobe Target implementation to request mbox decisions for a user
 * @function callAdobeTargetDeliveryAPI
 * @param {mcmidValue} mcmidValue - mcmid value
 * @returns {targetCampaign} Returns target campaign from the api
 */

function callAdobeTargetDeliveryAPI(mcmidValue) {
    if (!empty(mcmidValue)) {
        // get mboxes dynamically from custom preference
        const mboxArr = []; 
        const mboxEnum = Site.getCurrent().getCustomPreferenceValue("AdobeTargetMboxes");
        for (let i=0; i<mboxEnum.length; i++) {
            mboxArr.push({
                "name": mboxEnum[i].value,
                "index": i+1
            });
        }
        // build out the full request payload
        const o = {
            "id": {
                "marketingCloudVisitorId": mcmidValue
            },
            "experienceCloud": {
                "analytics": {
                    "supplementalDataId": mcmidValue,
                    "trackingServer": AdobeTrackingServer,
                    "logging": "server_side"
                }
            },
            "context": {
                "channel": "web",
                "browser": {
                    "host": request.httpHost
                },
                "address": {
                    "url": request.httpURL.toString()
                }
            },
            "execute": {
                "mboxes": mboxArr
            }
        };

        const deliveryRes = AdobeTargetServiceInit.Delivery.call(o);
        if (deliveryRes.isOk() && !empty(deliveryRes.object) && deliveryRes.object.execute && 'mboxes' in deliveryRes.object.execute) {
            return setTargetCampaignsInSession(deliveryRes.object.execute.mboxes);
        }
    }
}

/**
 * Utility function to isolate and split mbox data into session for Adobe Target; 
 * frontend will pick this data up from digitalData.page.attributes.mboxes in the data layer
 * @function setTargetCampaignsInSession
 * @param {mArr} mArr - mArr value
 * @returns {targetCampaign} Returns target campaign in sesion
 */
function setTargetCampaignsInSession(mArr) {
    const htmlArr = [];
    const targetCgArr = [];
    const featureToggleArr = [];
    const targetFlagsObj = {};
    const targetAnalyticsData = [];
    
    for (let i=0; i<mArr.length; i++) {
        if (!empty(mArr[i].options)) {
            switch (mArr[i].options[0].type.toLowerCase()) {
                case "html":
                    htmlArr.push(mArr[i].name);
                    break;
                case "json":
                    if (!empty(mArr[i].options[0].content.type)) {
                        switch (mArr[i].options[0].content.type.toLowerCase()) {
                            case "customergroup":
                                targetCgArr.push(mArr[i].options[0].content.value);
                                break;
                            case "featuretoggle":
                                featureToggleArr.push({
                                    "sitePreference": mArr[i].options[0].content.sitePreference,
                                    "state": mArr[i].options[0].content.state
                                });
                                break;
                            case "targetflag":
                                if (!empty(mArr[i].options[0].content.test) && !empty(mArr[i].options[0].content.value)) {
                                    targetFlagsObj[mArr[i].options[0].content.test] = mArr[i].options[0].content.value;
                                }
                                break;
                            default:
                                break;
                        }
                    }
                    break;
                default:
                    break;
            }
            targetAnalyticsData.push(mArr[i].options[0].responseTokens)
        }
    }

    const targetCampaigns = {}

    // if we found any offers to pass to the frontend, set in Session
    targetCampaigns.mboxes = htmlArr.length > 0 ? JSON.stringify(htmlArr) : '';
    targetCampaigns.targetcg = targetCgArr.length > 0 ? targetCgArr.join(",") : '';
    targetCampaigns.featuretoggles = featureToggleArr.length > 0 ? JSON.stringify(featureToggleArr) : '';
    targetCampaigns.targetflags = Object.keys(targetFlagsObj).length ? JSON.stringify(targetFlagsObj) : '';
    targetCampaigns.targetAnalyticsData = targetAnalyticsData.length > 0 ? JSON.stringify(targetAnalyticsData) : '';

    return targetCampaigns
}


module.exports = {
    setMCMIDFromAPI,
    callAdobeTargetDeliveryAPI,
}