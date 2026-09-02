const apiUtils = require('app_composable/cartridge/scripts/apiUtils.js');
const apiImplementation = require('app_composable/cartridge/scripts/apis/customPreferences.js');
const Log = require('dw/system/Logger');
const Logger = Log.getLogger('CustomPreferenceError');
const cacheTTLManager = require('app_composable/cartridge/scripts/helpers/util/cacheTTLManager.js');
const System = require('dw/system/System');

/**
 * This SCAPI CUSTOM API endpoint is used to look up Custom Site Preferences
 */
exports.customPreferences = function () {
    try {
        const preferences = request.httpParameters.get('c_ids');
        let customPrefData = apiImplementation.getCustomPreferences(preferences);
        if (System.getInstanceType() === System.PRODUCTION_SYSTEM) {
            cacheTTLManager.setResponseTTL();
        }
        apiUtils.createResponse(200, customPrefData);
    } catch (e) {
        Logger.warn('Site Pref lookup failed: {0}', e.message);
        let httpCode = e.httpCode || 500;
        apiUtils.createError(httpCode, {
            title: e.name || 'Server error',
            type: e.type || 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/' + httpCode,
            detail: e.message || 'An unexpected error occurred while processing the request.'
        });
    }
};

exports.customPreferences.public = true;
