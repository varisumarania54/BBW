'use strict';

const sitePrefHelper = require('app_composable/cartridge/scripts/helpers/util/sitePrefHelper');

/**
 * Retrieve a custom qualifier value from the current shopper context.
 * @param {string} key - The qualifier key to look up
 * @returns {string|null} The qualifier value, or null if not found
 */
function getCustomQualifier(key) {
    try {
        const ShopperContextMgr = require('dw/customer/shoppercontext/ShopperContextMgr');
        const shopperContext = ShopperContextMgr.getShopperContext();
        if (!shopperContext || !shopperContext.customQualifiers) {
            return null;
        }
        const value = shopperContext.customQualifiers.get(key);
        return !empty(value) ? value : null;
    } catch (e) {
        return null;
    }
}

/**
 * Parse the targetcg qualifier and find the state for a given flag name.
 * @param {string} flagName - The flag name to search for
 * @returns {string|null} "on", "off", or null if not found
 */
function getFlagState(flagName) {
    const targetcg = getCustomQualifier('targetcg');
    if (!targetcg) {
        return null;
    }
    const match = targetcg.split(',')
        .map(f => f.trim())
        .find(f => {
            const lastDash = f.lastIndexOf('-');
            return lastDash > 0 && f.substring(0, lastDash) === flagName;
        });
    if (match) {
        return match.substring(match.lastIndexOf('-') + 1).toLowerCase();
    }
    return null;
}

/**
 * Look up a flag in the targetcg custom qualifier and return whether it is "on" or "off".
 * The targetcg string is comma-delimited, e.g. "enablePDPRedesign-on,shopping-bag-redesign-off".
 * The last "-" separates the flag name from the state.
 * @param {string} flagName - The flag name to search for (e.g. "shopping-bag-redesign")
 * @returns {boolean} true if the flag's state is "on", false otherwise
 */
function getAdobeFlag(flagName) {
    const adobeEnabled = sitePrefHelper.getSitePrefValue('AdobeTargetEnabled');
    if (!adobeEnabled || !flagName) {
        return false;
    }
    return getFlagState(flagName) === 'on';
}

/**
 * Check if a feature is enabled, using Adobe Target targetcg flag as override when present.
 * If the flag exists in targetcg, its on/off state wins. Otherwise, fall back to the site preference.
 * @param {string} flagName - The Adobe targetcg flag name (e.g. "shopping-bag-redesign")
 * @param {string} sitePrefName - The site preference name to fall back to (e.g. "enableShoppingBagRedesign")
 * @returns {boolean} true if the feature is enabled
 */
function isFeatureEnabled(flagName, sitePrefName) {
    const adobeEnabled = sitePrefHelper.getSitePrefValue('AdobeTargetEnabled');
    if (adobeEnabled && flagName) {
        const state = getFlagState(flagName);
        if (state !== null) {
            return state === 'on';
        }
    }
    // flag not found in targetcg — fall back to site preference
    const Site = require('dw/system/Site').getCurrent();
    return !empty(Site.getCustomPreferenceValue(sitePrefName)) && Site.getCustomPreferenceValue(sitePrefName);
}

module.exports = {
    getCustomQualifier: getCustomQualifier,
    getAdobeFlag: getAdobeFlag,
    isFeatureEnabled: isFeatureEnabled
};
