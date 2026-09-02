'use strict';
const apiUtils = require('app_composable/cartridge/scripts/apiUtils.js')
const apiImplementation = require('app_composable/cartridge/scripts/apis/productsAvailability.js');
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;
const cacheTTLManager = require('app_composable/cartridge/scripts/helpers/util/cacheTTLManager.js');

/**
 * @function productsAvailability
 * @description
 * Handles GET requests to return product availability for a specific store.
 * This API reads `c_storeId` and `c_productIds` from the HTTP query parameters,
 * calls the underlying service layer (`apiImplementation.getProductsAvailability`),
 * sets the appropriate response TTL using `cacheTTLManager`,
 * and returns a JSON response using `apiUtils.createResponse`.
 *
 * On error, the function logs the exception and returns a standardized 500 error
 * using `apiUtils.createError`.
 *
 * @example
 * // Example request:
 * // /on/demandware.store/Sites-Site/default/CustomAPI-ProductsAvailability?c_storeId=123&c_productIds=prod1,prod2
 *
 * @returns {void} Sends JSON response directly to the client.
 *
 * @throws {Error} Logs any unexpected server-side error and returns a 500 response.
 */

exports.productsAvailability = function () {
    try {
        const params = request.httpParameters;
        const storeId = params.c_storeId ? params.c_storeId[0]: null;
        const productIds = params.c_productIds ? params.c_productIds[0] : '';
        let responses = apiImplementation.getProductsAvailability(storeId, productIds);
        cacheTTLManager.setResponseTTL();
        apiUtils.createResponse(200, responses);
    } catch (e) {
        logHandler.logger.error(e, 'CustomAPI', 'productsAvailability - API');
        let httpCode = e.httpCode || 500;
        apiUtils.createError(httpCode, {
            title: e.name || 'OOPS: Internal Server Error',
            type: e.type || 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/' + httpCode,
            detail: e.message
        });
    }
}
exports.productsAvailability.public = true;