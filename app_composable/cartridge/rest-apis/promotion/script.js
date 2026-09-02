/**
 * Custom promotion api
 * @namespace promotion
 */
const apiUtils = require('app_composable/cartridge/scripts/apiUtils.js');
const apiImplementation = require('app_composable/cartridge/scripts/apis/promotion/promoRanks.js')
const cacheTTLManager = require('app_composable/cartridge/scripts/helpers/util/cacheTTLManager.js');

/**
 * This SCAPI CUSTOM API endpoint is used to lookup all applicable promotions for a customer from the entire site
 * @function rank
 * @memberof promotion
 * @returns {object} all applicable promotions for a customer
 */
exports.rank = function () {
    try {
        // TO-DO: Tech debt to modify this response instead of replacing. Will need to coordinate with FE.
        response = apiImplementation.getPromotionsForCustomer();
        apiUtils.createResponse(200, response);
        cacheTTLManager.setResponseTTL();
    } catch (e) {
        let httpCode = e.httpCode || 500;
        apiUtils.createError(httpCode, {
            title: e.name || 'Server error',
            type: e.type || 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/' + httpCode,
            detail: e.message || 'An unexpected error occurred while processing the request.'
        })
    }

}

exports.rank.public = true;
