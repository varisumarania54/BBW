"use strict";

/**
 * Basket
 * @namespace CustomerCare
 */

const Ocapi = require('app_composable/cartridge/scripts/services/OCAPIData.js');
const scapiService = require('app_composable/cartridge/scripts/services/SCAPI.js');
const twoHours = 7200000;
const Site = require('dw/system/Site').getCurrent();

/**
 * Cleans up pci pal info off the basket when session is expired.
 * @function sessionCleanup
 * @memberof CustomerCare
 * @param {Basket} basket - current user's basket
 */
function isSecurePaymentRoleLookupExpired(){
    let now = Date.now();
    let lastUpdated = session.custom.spLastUpdateTime;
    return empty(session.custom.spLastUpdateTime) || now - lastUpdated >= twoHours;
}

/**
 * Cleans up pci pal info off the basket when session is expired.
 * @function sessionCleanup
 * @memberof CustomerCare
 * @param {Basket} basket - current user's basket
 */
function sessionCleanup(basket) {
    let pcipalSessionRemainingTime = 0;
    if (basket) {
        if (basket.custom.pcipalSessionTimeToExpired) {
            let now = Date.now();
            let timeLeft = now - basket.custom.pcipalSessionTimeToExpired;
            pcipalSessionRemainingTime = timeLeft;
        }
        basket.custom.pcipalSessionRemainingTime = pcipalSessionRemainingTime > 0 ? pcipalSessionRemainingTime : 0;
        if (pcipalSessionRemainingTime <= 0) {
            basket.custom.accessToken = "";
            basket.custom.refreshToken = "";
            basket.custom.pcipalSessionId = "";
        }
    }
}

/**
 * If the user is an agent then check if there secure payment privileges have expired. .
 * @function HandleAgent
 * @memberof CustomerCare
 * @param {Basket} basket - current user's basket
 * @param {String} token - Slas token
 * @param {String} usid - current user's usid
 * @param {String} organizationId - organization id
 */
function HandleAgent(basket,token, usid, organizationId) {
    if (session.userAuthenticated && !empty(token) && !empty(usid) && !empty(organizationId)) {
        if (Site.getCustomPreferenceValue('doOcapiChecksForPCIPAL') && isSecurePaymentRoleLookupExpired()) {
            checkRolesAndUpdateSC(token, usid, organizationId);
        }
        sessionCleanup(basket);
    }
}

/**
 * Calls ocapi to get the authenticated users roles and updates the shopper context with the obtained information  .
 * @function checkRolesAndUpdateSC
 * @memberof CustomerCare
 * @param {String} token - Slas token
 * @param {String} usid - current user's usid
 * @param {String} organizationId - organization id
 */
function checkRolesAndUpdateSC(token, usid, organizationId) {
    let authRes = Ocapi.GetOAuthCC.call();
    if (!authRes.error && !empty(authRes.object) && !empty(authRes.object.access_token)) {
        var result = Ocapi.GetUser.call({
            "access_token": authRes.object.access_token,
            "email": session.userName,
            "host": Site.httpsHostName
        });
        if (result.isOk() && !empty(result.object) && result.object.roles.indexOf(Site.getCustomPreferenceValue('sp_restrictedrole')) > -1) {
            let shopperContextParams = {
                auth: "Bearer " + token,
                usid: usid,
                organizationId : organizationId,
                requestBody: {
                    first_name : result.object.first_name,
                    last_name : result.object.last_name,
                    isSecurePayment : true,
                    spLastUpdateTime : Date.now()
                }
            }
            scapiService.ShopperContext.call(shopperContextParams);
        }
    }
}
module.exports = {
    HandleAgent,
};
