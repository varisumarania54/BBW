const apiUtils = require('app_composable/cartridge/scripts/apiUtils.js');
const apiImplementation = require('app_composable/cartridge/scripts/apis/orderHistory.js');
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;
/**
 * This SCAPI CUSTOM API endpoint is used to look up Order Details
 */
exports.orderDetails = function () {
    try {
        const params = request.getHttpParameterMap();
        // required parameter
        const orderNo = params.get("c_orderNo").getStringValue();
        let regex = /^\d+$/;
        if (regex.test(orderNo) === false) {
            response.setStatus(400);
            throw new Error(`Invalid Order ID`);
        }
        // optional order tracking parameters
        const email = params.isParameterSubmitted("c_email") ? params.get("c_email").getStringValue().toLowerCase() : null;
        const postalCode = params.isParameterSubmitted("c_billingPostalCode") ? params.get("c_billingPostalCode").getStringValue().toUpperCase() : null;
        
        const resp = apiImplementation.getOrderDetails(orderNo, email, postalCode);
        apiUtils.createResponse(200, resp);
    } catch (e) {
        logHandler.logger.error(e, 'CustomAPI', 'order-details');
        let httpCode = e.httpCode || 500;
        apiUtils.createError(httpCode, {
            title: e.name || 'Server error',
            type: e.type || 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/' + httpCode,
            detail: e.message || 'An unexpected error occurred while processing the request.'
        });
    }
};

exports.orderDetails.public = true;