'use strict';

const apiUtils = require('app_composable/cartridge/scripts/apiUtils');
const apiImplementation = require('app_composable/cartridge/scripts/helpers/util/sitePrefHelper');
const Log = require('dw/system/Logger');
const Logger = Log.getLogger('CustomHeadersError');

/**
 * This SCAPI CUSTOM API endpoint returns the FE-HEADER-OVERRIDES custom object
 * entries — i.e. the set of c_headername values and their associated site
 * preference IDs. The frontend uses this list to know which custom request
 * headers it may send to batch-override preference values.
 */
exports.switches = function () {
    try {
        const params = request.getHttpParameterMap();
        const source = params.get("c_source").getStringValue();
        const queryString = `custom.source = '${source}'`;
        const resp = apiImplementation.queryAllSwitches(queryString);
        apiUtils.createResponse(200, resp);
    } catch (e) {
        Logger.warn('SignalSwitch failed: {0}', e.message);
        const httpCode = e.httpCode || 500;
        apiUtils.createError(httpCode, {
            title: e.name || 'Server error',
            type: e.type || 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/' + httpCode,
            detail: e.message || 'An unexpected error occurred while processing the request.'
        });
    }
};

exports.switches.public = true;
