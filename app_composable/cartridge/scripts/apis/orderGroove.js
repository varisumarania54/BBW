/**
 * Order Groove
 * @namespace orderGroove
 */
const Encoding = require('dw/crypto/Encoding');
const Mac = require('dw/crypto/Mac');
const Site = require('dw/system/Site');
/**
 * Creates encoded signature for og_auth cookie 
 * @function getSignature
 * @memberof orderGroove
 * @param {String} customerNumber - Customer number on profile
 * @returns {String} Returns encoded signature for og_auth cookie
 */
exports.getSignature = function (customerNumber) {
	const epoch = (Date.now() / 1000.0).toPrecision(10);
	const hashInput = customerNumber.concat('|', epoch);
	const encryptor = new Mac(Mac.HMAC_SHA_256);
	const hashKey = Site.getCurrent().getCustomPreferenceValue("OrderGrooveMerchantHashKey");
	const hashBytes = encryptor.digest(hashInput, hashKey);
	return Encoding.toBase64(hashBytes);
}