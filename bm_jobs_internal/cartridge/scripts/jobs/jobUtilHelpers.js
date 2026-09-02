'use strict';

var Site = require("dw/system/Site");
var URLUtils = require("dw/web/URLUtils");

/**
 * 
 * @param {*} product 
 * @param {*} preference 
 * @returns sanitizedUrl
 */
function sanitizeUrl(product, preference) {
    let isSanitizedLinks = Site.getCurrent().getCustomPreferenceValue(preference);
    let url = URLUtils.https("Product-Show", "pid", product.ID).toString();
    if (isSanitizedLinks) {
        url = url.replace('.html', '');
    }
    return url; 
}

module.exports = {
    sanitizeUrl : sanitizeUrl
}