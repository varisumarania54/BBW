'use strict'

const apiUtils = require('app_composable/cartridge/scripts/apiUtils.js');
const apiImplementation = require('app_composable/cartridge/scripts/apis/loyalty.js');
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;
const dataValidation = require('app_composable/cartridge/scripts/helpers/util/dataValidation.js').dataValidation;
const errorHandler = require('app_composable/cartridge/scripts/helpers/util/errorHandler.js').errorHandler;

/**
 * This SCAPI CUSTOM API endpoint is used to lookup customer bond and offer data and update customer profile
 */
exports.loyalty = function () {
    try {
        let requestBody = JSON.parse(request.httpParameterMap.requestBodyAsString);

        //create error if not enabled, may need to check with this if this is locale specific business requirements probably easy since we have site specific locales to change site prefs
        let loyaltyEnabled = dataValidation.validSitePref('bondLoyaltyEnabled', false);
        let loyaltyUseSlasJWT = dataValidation.validSitePref('useSlasJWT', false);

        if (loyaltyEnabled && !loyaltyUseSlasJWT) {
            let c_slasjwt = dataValidation.emptyCheck(requestBody.c_slasjwt, '');
            let response = apiImplementation.post.getOffers(c_slasjwt);
            apiUtils.createResponse(response.status, response);
        } else {
            throw new errorHandler.newError('Loyalty Error', 'Invalid Loyalty Params / Preferences', 400, 'loyalty.js');
        }
    } catch (e) {
        let httpCode = e.httpCode || 500;

        apiUtils.createError(httpCode, {
            title: e.name || 'LoyaltyDataDefault',
            type: e.type || 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/' + httpCode,
            detail: e.message || 'An unexpected error occurred while processing the request.'
        });
        logHandler.logger.error(e, 'CustomAPI', 'loyaltyData');
    }
};

exports.loyalty.public = true;

exports.activateOffer = function () {
    try {
        let requestBody = JSON.parse(request.httpParameterMap.requestBodyAsString);
        let c_email_hash = dataValidation.emptyCheck(requestBody.c_email_hash, '');
        let c_offer_id = dataValidation.emptyCheck(requestBody.c_offer_id, '');
        let response = apiImplementation.post.activateOffer(c_email_hash, c_offer_id);
        apiUtils.createResponse(response.status, response);
    } catch (e) {
        let httpCode = e.httpCode || 500;

        apiUtils.createError(httpCode, {
            title: e.name || 'activateOfferError',
            type: e.type || 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/' + httpCode,
            detail: e.message || 'An unexpected error occurred while processing the request.'
        });
        logHandler.logger.error(e, 'CustomAPI', 'loyaltyData');
    }
};

exports.activateOffer.public = true;

exports.pointsHistory = function () {
    try {
        const param = request.httpParameters.get('c_pagenum');
        const pagenum = param && param[0];
        const response = apiImplementation.get.pointsHistory(pagenum);
        apiUtils.createResponse(200, response);
    } catch (e) {
        let httpCode = e.httpCode || 500;
        apiUtils.createError(httpCode, {
            title: e.name || 'PointsHistoryDefault',
            type: e.type || 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/' + httpCode,
            detail: e.message || 'An unexpected error occurred while processing the request.'
        });
        logHandler.logger.error(e, 'CustomAPI', 'pointsHistory');
    }
}

exports.pointsHistory.public = true;
