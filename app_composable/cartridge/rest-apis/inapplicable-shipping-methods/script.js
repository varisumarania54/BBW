'use strict'

const apiUtils = require('app_composable/cartridge/scripts/apiUtils.js');
const apiImplementation = require('app_composable/cartridge/scripts/apis/shippingMethods.js');
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;

/**
 * This SCAPI CUSTOM API endpoint is used to get inapplicable shipping methods
 */
exports.inapplicableShippingMethods = function () {
    try {
        if (!dw.system.Site.getCurrent().getCustomPreferenceValue('addInapplicableShippingMethods')) {
            let httpCode = 404;
            apiUtils.createError(httpCode, {
                title: 'Page not found',
                type: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/' + httpCode,
                detail: 'The custom preference Add Inapplicable Shipping Methods is set to false'
            });
            return;
        }
        let requestBody = apiUtils.getJSONReqBody();
        let c_shipment = !empty(requestBody) && !empty(requestBody.c_shipment) ? requestBody.c_shipment : '';

        let response = apiImplementation.get.getInapplicableShippingMethodsInfo({c_shipment: c_shipment});

        apiUtils.createResponse(response.status, response);

    } catch (e) {
        let httpCode = e.httpCode || 500;
        apiUtils.createError(httpCode, {
            title: e.name || 'inapplicableShippingMethods',
            type: e.type || 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/' + httpCode,
            detail: e.message || 'An unexpected error occurred while processing the request.'
        });

        logHandler.logger.error(e, 'CustomAPI', 'inapplicableShippingMethods');
    }
};

exports.inapplicableShippingMethods.public = true;
