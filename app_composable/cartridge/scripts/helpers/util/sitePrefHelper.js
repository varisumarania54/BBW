'use strict'

const Site = require('dw/system/Site').getCurrent();
const System = require('dw/system/System');
const CustomObjectMgr = require('dw/object/CustomObjectMgr');
const Logger = require('dw/system/Logger').getLogger('sitePrefHelper', 'sitePrefHelper');

/**
 * Retrieves a Business Manager custom site preference value by its ID.
 *
 * On production, always returns the BM value directly.
 *
 * On non-production environments, allows a boolean preference to be overridden
 * at request time via an HTTP header named `c_{key}` (lowercased). The override
 * is only applied when all three conditions are met:
 *   1. The header `c_{key}` is present on the request
 *   2. The BM preference value is a boolean type
 *   3. The header value is exactly `"true"` or `"false"`
 *
 * If any condition is not met, the BM value is returned unchanged.
 *
 * @function getSitePrefValue
 * @param {string} preference - The Business Manager custom preference ID (e.g. `'enableStorePickUp'`)
 * @param {Object} [customHeaders] - Optional pre-fetched header map from {@link getCustomHeaders}.
 *   When omitted, headers are fetched automatically via {@link getCustomHeaders}.
 * @returns {*} The preference value from BM, or the boolean header override on non-production
 *
 * @example
 * // Returns BM value on production; respects c_enablestorepickup header on non-prod
 * const isEnabled = getSitePrefValue('enableStorePickUp');
 */
function getSitePrefValue(preference, customHeaders) {
    let spValue = Site.getCustomPreferenceValue(preference);
    try {
        if (System.getInstanceType() !== System.PRODUCTION_SYSTEM) {
            const headers = typeof customHeaders === 'object' && Object.keys(customHeaders).length > 0 ? customHeaders : getCustomHeaders();
            const isBooleanPref = typeof spValue === 'boolean';
            const headerName = 'c_' + preference.toLowerCase();
            let headerVal = null;
            const headerKeys = Object.keys(headers);

            if (isBooleanPref && headerKeys.length) {
                let directMatch = null;
                let groupMatch = null;

                headerKeys.forEach(key => {
                    if (headerName === key) {
                        directMatch = typeof headers[key] === 'string' ? headers[key] : (headers[key] && headers[key].value) || null;
                    }
                    if (headerName !== key && headers[key] && headers[key].preferences && headers[key].preferences.includes(preference)) {
                        groupMatch = headers[key].value;
                    }
                });

                // Group-level assignment takes priority over direct top-level match
                // If multiple group-level matches exist, the last one iterated will take priority (non-deterministic)
                headerVal = groupMatch !== null ? groupMatch : directMatch;
            }

            const isOverridden = isBooleanPref && (headerVal === 'true' || headerVal === 'false');
            if (isOverridden) {
                Logger.info('getSitePrefValue: preference "{0}" overridden by header "{1}" with value "{2}"', preference, headerName, headerVal);
            }

            spValue = isOverridden ? headerVal === 'true' : spValue;
        }
    } catch (error) {
        Logger.info('SignalSwitch encountered {0}', error);
    }
    return spValue;
}

/**
 * Queries the SignalSwitchz custom object for records matching the given SFCC query string
 * and merges the results with the provided raw header map.
 *
 * @function querySwitches
 * @param {string} queryString - SFCC query string to filter SignalSwitchz records
 * @param {Object.<string, string>} headers - Raw map of c_-prefixed header name → header value
 * @returns {Object} Merged map of header name → { enable, value, preferences } (or raw string for unmatched headers)
 */
function querySwitches(queryString, headers) {
    let results = {};
    let switches;

    try {
        switches = CustomObjectMgr.queryCustomObjects('SignalSwitch', queryString, null);
        while (switches.hasNext()) {
            let obj = switches.next();
            let header = obj.custom.header;
            if (!empty(header) && headers[header]) {
                results[header] = {
                    enable: obj.custom.enable,
                    value: headers[header] || null,
                    preferences: Array.prototype.slice.call(obj.custom.preferences) || null,
                    description: obj.custom.description
                };
            }
        }
        results = Object.assign({}, headers, results);
    } catch (error) {
        Logger.error('querySwitches: error querying SignalSwitch with query "{0}": {1}', queryString, error);
    } finally {
        if (switches && typeof switches.close === 'function') {
            switches.close();
        }
    }

    return results;
}

/**
 * Queries the SignalSwitchz custom object for records matching the given SFCC query string
 *
 * @function queryAllSwitches
 * @param {string} queryString - SFCC query string to filter SignalSwitchz records
 * @returns {Object} Merged map of header name → { enable, value, preferences } (or raw string for unmatched headers)
 */
function queryAllSwitches(queryString) {
    let results = {};
    let switches;

    try {
        switches = CustomObjectMgr.queryCustomObjects('SignalSwitch', queryString, null);
        while (switches.hasNext()) {
            var obj = switches.next();
            var header = obj.custom.header;
            if (!empty(header)) {
                results[header] = obj.custom.description;
            }
        }
    } catch (error) {
        Logger.error('querySwitches: error querying SignalSwitch with query "{0}": {1}', queryString, error);
    } finally {
        if (switches && typeof switches.close === 'function') {
            switches.close();
        }
    }

    return results;
}

/**
 * Reads all incoming c_-prefixed request headers, then queries the SignalSwitches
 * custom object type for records whose `header` key matches any of those headers.
 * Returns a plain JS object mapping header name → array of controlled preference IDs.
 * If no c_ headers are present in the request the map is returned empty.
 *
 * @function getCustomHeaders
 * @memberof CustomPreferenceAPI
 * @returns {Object} map of c_-prefixed header name → preference IDs
 */
function getCustomHeaders() {
    const customHeaders = {};
    const requestHeaders = request.getHttpHeaders();
    const headerIterator = requestHeaders.keySet().iterator();
    const conditions = [];

    while (headerIterator.hasNext()) {
        let header = headerIterator.next();
        let value = requestHeaders.get(header);
        if (header === 'c_signalswitch_true' || header === 'c_signalswitch_false') {
            header.split(',').forEach((s) => {
                customHeaders[value] = header.slice(header.lastIndexOf('_') + 1);
                conditions.push(`custom.header = '${value}'`);
            });
            continue;
        }
        if (header.startsWith('c_')) {
            customHeaders[header] = value;
            conditions.push(`custom.header = '${header}'`);
        }
    }

    if (Object.keys(customHeaders).length === 0) {
        return customHeaders;
    }

    const queryString = 'custom.enable = true';
    Logger.info('getCustomHeaders: querying SignalSwitch with "{0}"', queryString);
    return querySwitches(queryString, customHeaders);
}

module.exports = {
    getSitePrefValue,
    getCustomHeaders,
    querySwitches,
    queryAllSwitches
}
