const apiUtils = require('app_composable/cartridge/scripts/apiUtils.js');
const apiImplementation = require('app_composable/cartridge/scripts/apis/orderHistory.js');
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;
const errorHandler = require('app_composable/cartridge/scripts/helpers/util/errorHandler.js').errorHandler;
/**
 * This SCAPI CUSTOM API endpoint is used to look up Order History
 */
exports.orderHistory = function () {
    try {
        let orderHistory = apiImplementation.getOrderHistory();
        apiUtils.createResponse(200, orderHistory);
    } catch (e) {
        logHandler.logger.error(e, 'CustomAPI', 'order-history');
        let httpCode = e.httpCode || 500;
        apiUtils.createError(httpCode, {
            title: e.name || 'Server error',
            type: e.type || 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/' + httpCode,
            detail: e.message || 'An unexpected error occurred while processing the request.'
        });
    }
};

exports.orderHistory.public = true;
