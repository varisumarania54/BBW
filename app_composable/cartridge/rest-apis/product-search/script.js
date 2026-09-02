const apiUtils = require('app_composable/cartridge/scripts/apiUtils.js');
const apiImplementation = require('app_composable/cartridge/scripts/apis/productSearch.js');
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;
const storeHelpers = require('app_composable/cartridge/scripts/helpers/store/storeHelpers.js');

/**
 * This SCAPI CUSTOM API endpoint is used to look up Order History
 */
exports.productSearch = function () {
    try {
        const cgid = request.httpParameterMap.get('c_cgid').value;
        const q = request.httpParameterMap.get('c_q').value;
        const limit = request.httpParameterMap.get('c_limit').value;
        const filters = request.httpParameterMap.get('c_filters').value;
        let storeId = request.httpParameterMap.get('c_storeId').value;
        const sort = request.httpParameterMap.get('c_sort').value;
        const constructorClientId = request.httpParameterMap.get('c_i').value;
        const constructorSessionId = request.httpParameterMap.get('c_s').value;
        const offset = request.httpParameterMap.get('c_offset').value;

        if (!empty(storeId) && !storeHelpers.getStoreAvailableCache(storeId)) { 
            storeId = null;
        }

        if (empty(q) && empty(cgid)) {
            throw {
                httpCode: 400,
                name:'Invalid request',
                type:'https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/400',
                message:'Either a search term (c_q) or a category group ID (c_cgid) must be provided.'
            }
        }

        if (!empty(q) && !empty(cgid)) {
            throw {
                httpCode: 400,
                name:'Invalid request',
                type:'https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/400',
                message:'Provide either a search term (c_q) or a category group ID (c_cgid), but not both.'
            }
        }

        const results = apiImplementation.search(offset, limit, storeId, filters, cgid, q, sort, constructorClientId, constructorSessionId);
        apiUtils.remoteIncludeResponse(results);
    } catch (e) {
        logHandler.logger.error(e, 'CustomAPI', 'product-search');
        let httpCode = e.httpCode || 500;
        apiUtils.createError(httpCode, {
            title: e.name || 'Server error',
            type: e.type || 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/' + httpCode,
            detail: e.message || 'An unexpected error occurred while processing the request.'
        });
    }
};

exports.productSearch.public = true;
