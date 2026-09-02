"use strict";
/**
 * Basket
 * @namespace OOBO
 */
const pciPalService = require('app_composable/cartridge/scripts/services/SecurePaymentServices.js');
const Site = require('dw/system/Site').getCurrent();

/**
 * Generates a new pcipal session and
 * @function generateSession
 * @memberof OOBO
 * @param {String} agentRole - The roll of communication looking to be opened [phone , chat]
 * @param {Basket} basket - current user's basket
 */
function generateSession(agentRole, basket) {
    let reqBody = {
        'FlowId': Site.getCustomPreferenceValue('sp_flow_id'),
        'InitialValues': {
            'agentCombinedDomainUsername': session.userName,
            'agentRole': agentRole
        },
  
    };
    if('locale' in session.custom && !empty(session.custom.locale)) {
        reqBody.InitialValues.languageLocale = session.custom.locale;
    }
    const pciSessionResponse = pciPalService.SessionGeneration.call({ token: basket.custom.accessToken, tenant_id: Site.getCustomPreferenceValue('sp_tenant_Id'), body: reqBody });

    if (pciSessionResponse.status == 'OK' && !empty(pciSessionResponse.object)) {
        basket.custom.pcipalSessionId = pciSessionResponse.object.Id;
        basket.custom.pcipalRole = agentRole;
    }
    else {
        throw new Error(JSON.stringify({ 'status': 'ERROR', 'message': 'Could not initialize secure payment session, try again later' }));
    }
}

/**
 * Generates a new pcipal Auth Token and stores it on the basket
 * @function getToken
 * @memberof OOBO
 * @param {Basket} basket - current user's basket
 */
function getToken(basket) {
    let reqBody = {
        'grant_type': Site.getCustomPreferenceValue('sp_grant_type'),
        'username': Site.getCustomPreferenceValue('sp_username'),
        'tenantname': Site.getCustomPreferenceValue('sp_tenantname')
    };
    const pciSessionAuth = pciPalService.GetToken.call(reqBody);
    if (pciSessionAuth.status == "OK" && !empty(pciSessionAuth.object)) {
        basket.custom.accessToken = pciSessionAuth.object.access_token;
        basket.custom.refreshToken = pciSessionAuth.object.refresh_token;
        basket.custom.pcipalSessionTimeToExpired = pciSessionAuth.object.expires.valueOf();
        return pciSessionAuth.object;
    }
    throw new Error(JSON.stringify({ 'status': 'ERROR', 'message': 'Could not initialize secure payment session, try again later' }));
}

/**
 * Checks if the current pcipal session is still valid
 * @function getToken
 * @memberof OOBO
 * @param {Basket} basket - current user's basket
 */
function getPollSession(basket, role) {
    let pciPollSessionArgs = {
        token: basket.custom.accessToken,
        body: {
            tenant_id: Site.getCustomPreferenceValue('sp_tenant_Id'),
            pcipal_session_id: basket.custom.pcipalSessionId
        }
    };
    let pciSessionResponse = pciPalService.PollSession.call(pciPollSessionArgs);
    return pciSessionResponse.isOk();
}

/**
 * Clear pcipal session if role changes
 * @function clearPCIData
 * @memberof OOBO
 * @param {Basket} basket - current user's basket
 * @param {String} role - The roll the oobo agent is targeting
 */
function clearPCIData(basket, role) {
    basket.custom.pcipalSessionId = null;
    basket.custom.accessToken = null;
    basket.custom.refreshToken = null;
    basket.custom.pcipalSessionTimeToExpired = null;
    basket.custom.pcipalRole = null;
}

/**
 * Starts a pcipal payment session or gets an exsisting valid one.
 * @function getToken
 * @memberof OOBO
 * @param {Basket} basket - current user's basket
 * @param {String} role - The roll the oobo agent is targeting
 */
function startPCIPalSession(basket, role) {
    clearPCIData(basket, role);
    getToken(basket);
    generateSession(role, basket);
    if (!empty(basket.custom.pcipalSessionId) && !empty(Site.getCustomPreferenceValue('sp_actionurl'))) {
        return {
            'status': "OK",
            "sessionId": basket.custom.pcipalSessionId,
            "access_token": basket.custom.accessToken,
            "refresh_token": basket.custom.refreshToken,
            "action_url": Site.getCustomPreferenceValue('sp_actionurl') + basket.custom.pcipalSessionId + '/framed',
            "expires": basket.custom.pcipalSessionTimeToExpired
        };
    }
}
module.exports = {
    startPCIPalSession
}
