'use strict'

const Site = require('dw/system/Site');
const enabledForceSoldOut = Site.getCurrent().getCustomPreferenceValue('enableForceSoldOutCheck');

/**
 * @namespace ForceSoldOutHelper
 */

/**
 * Returns a boolean on whether the current day falls within the Force Sold Out date range.
 * @function isWithinForceOOSDateRange
 * @param {string} startDate - Product custom attribute Force Sold Out Date start date EX: 2024-11-07T05:00:00.000Z
 * @param {string} endDate - Product custom attribute Force Sold Out Date end date EX: 2024-11-07T05:00:00.000Z
 * @returns {Boolean} Returns true if within provided date range
 * @memberof ForceSoldOutHelper
 */
function isWithinForceOOSDateRange(startDate, endDate) {
	if (!enabledForceSoldOut) {
        return false;
    }

    let isWithinRange = false; // default

	if (!empty(startDate) && !empty(endDate)) {
        let current = new Date();
        if (current > startDate && current < endDate) {
            isWithinRange = true;
        }
	}

	return isWithinRange;
};

/**
 * Returns a boolean on whether the current day falls within the Force Sold Out date range.
 * @function displayAsOutOfStock
 * @param {Object} product - Product object
 * @returns {Boolean} Returns true if within provided date range
 * @memberof ForceSoldOutHelper
 */
function displayAsOutOfStock(product) {

    if (!enabledForceSoldOut) {
        return false;
    }

    const withinDateRange = isWithinForceOOSDateRange(product.custom.forceSoldOutStartTime, product.custom.forceSoldOutEndTime);

    return withinDateRange;
};



/**
 * Returns a boolean on whether a product is marked as sold out.
 * @function isMarkedAsSoldOutProduct
 * @param {Product} product - Product id
 * @returns {Boolean} Returns true if within provided date range
 * @memberof ForceSoldOutHelper
 */
function isMarkedAsSoldOutProduct(product) {

    if (!enabledForceSoldOut) {
        return false;
    }

    if(!empty(product)){
        return displayAsOutOfStock(product);
    }
    return false;
};

/**
 * Returns a boolean on whether a product is marked as sold out.
 * @function refreshCacheTime
 * @param {Product} product - Product id
 * @returns {Number|null} Returns epoch time of when cache should be refreshed
 * @memberof ForceSoldOutHelper
 */
function refreshCacheTime(product) {

    if (!empty(product.custom.forceSoldOutStartTime) && !empty(product.custom.forceSoldOutEndTime)) {
        var currentTime = new Date().getTime();

        if (product.custom.forceSoldOutStartTime > currentTime) {
            return product.custom.forceSoldOutStartTime.getTime();
        } else if (product.custom.forceSoldOutEndTime > currentTime) {
            return product.custom.forceSoldOutEndTime.getTime();
        } else {
            return null;
        }
    }
};

module.exports = {
    isWithinForceOOSDateRange,
    displayAsOutOfStock,
    isMarkedAsSoldOutProduct,
    refreshCacheTime
}

