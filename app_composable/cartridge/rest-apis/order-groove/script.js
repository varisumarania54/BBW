const apiUtils = require('app_composable/cartridge/scripts/apiUtils.js');
const apiImplementation = require('app_composable/cartridge/scripts/apis/orderGroove.js');
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;
const errorHandler = require('app_composable/cartridge/scripts/helpers/util/errorHandler.js').errorHandler;

/**
 * If the customer is registered we use customer number to generate
 * an encrypted signature string for og_auth cookie
 * @function getOGSignature
 */
exports.getOGSignature = function () {
    try {
        if (!customer.isRegistered() && !customer.isAuthenticated()) {
            throw new errorHandler.newError('Forbidden Request', 'Guest customers cannot generate signature', '403');
        }
        const customerNumber = customer.getProfile().getCustomerNo();
        const signature = apiImplementation.getSignature(customerNumber);
        apiUtils.createResponse(200, { signature });
    } catch (e) {
        logHandler.logger.error(e, 'CustomAPI', 'getOGSignature');
        let httpCode = e.httpCode || 500;
        apiUtils.createError(httpCode, {
            title: e.name || 'Server error',
            type: e.type || 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/' + httpCode,
            detail: e.message || 'An unexpected error occurred while processing the request.'
        });
    }
};

exports.getOGSignature.public = true;
