/* eslint-disable */
'use strict';

/**
 * @module helper.js
 *
 * This JavaScript file implements methods (via Common.js exports) that are needed by
 * the OrderGroove cartridge.  This allows OCAPI calls to reference
 * these tools via the OCAPI 'hook' mechanism
 *
 */

/* Global API Includes */
var Logger = require('dw/system/Logger');
var Site = require('dw/system/Site');
var Encoding = require('dw/crypto/Encoding');

/**
 * @function signature
 *
 * Function creates a signature using SHA-256 with a customer number
 * and a Unix epoch.
 *
 * @param {string} customerID	The customer number
 * @param {string} timeStamp	The epoch time stamp (optional)
 */
exports.signature = function (customerID, timeStamp) {
	/* Local API Includes */
	var Mac = require('dw/crypto/Mac');
	var Bytes = require('dw/util/Bytes');

	if (empty(customerID) || typeof customerID !== 'string') {
		return new String();
	}
	var epoch = !empty(timeStamp) ? timeStamp : (Date.now() / 1000.0).toPrecision(10);
	var encryptor = new Mac(Mac.HMAC_SHA_256);
	var hashInput = customerID + "|" + epoch;
	var hashKey = Site.getCurrent().getCustomPreferenceValue("OrderGrooveMerchantHashKey");
	var hashBytes = encryptor.digest(hashInput, hashKey);
	var signature = Encoding.toBase64(hashBytes);
	var sig = new Object();
	sig['signature'] = signature;
	sig['timestamp'] = epoch;
	return sig;
};

/**
 * @function verify
 *
 * Function verifies a signature using a customer number with a timestamp.
 *
 * @param {string} customerID	The customer number
 * @param {string} auth			The JSON header value containing the authorization
 */
exports.verify = function (customerID, auth) {
	if (customerID === null || typeof customerID !== 'string' || auth === null || typeof auth !== 'string') {
		return false;
	}
	auth = JSON.parse(auth);
	var requestSig = auth["sig"];
	var requestCustomerID = auth["sig_field"];
	if (customerID !== requestCustomerID) {
		return false;
	}
	var timeStamp = auth["ts"];
	if (empty(timeStamp) || typeof timeStamp !== 'number') {
		return false;
	}
	var milliDate = Number((timeStamp * 1000.0).toPrecision(10));
	milliDate = new Date(milliDate);
	var Calendar = require('dw/util/Calendar');
	var requestDate = new Calendar(milliDate);
	var deadline = new Calendar();
	deadline.add(Calendar.HOUR, -2);
	if (deadline.after(requestDate) == true) {
		return false;
	}
	var sig = this.signature(requestCustomerID, timeStamp);
	var signature = sig["signature"];
	if (signature === requestSig) {
		return true;
	} else {
		return false;
	}
};

/**
 * @function cipher
 *
 * Function encrypts data using AES
 *
 * @param {string} data	The data to be encrypted
 */
exports.cipher = function (data) {
	/* Local API Includes */
	var StringUtils = require('dw/util/StringUtils');
	var WeakCipher = require('dw/crypto/WeakCipher');

	if (empty(data) || typeof data !== 'string') {
		return new String();
	}
	var hashKey = Site.getCurrent().getCustomPreferenceValue("OrderGrooveMerchantHashKey");
	var hashKeyEncoded = StringUtils.encodeBase64(hashKey);
	var padAmount = 32 - (data.length % 32);
	var padFill = StringUtils.pad(new String(), padAmount).replace(new RegExp(" ", "g"), "{");
	data += padFill;
	var dataEncrypted = new WeakCipher().encrypt(data, hashKeyEncoded, "AES/ECB/NOPADDING", "", 0);
	dataEncrypted = Encoding.toURI(dataEncrypted);
	return dataEncrypted;
};

/**
 * @function decipher
 *
 * Function decrypts data using AES
 *
 * @param {string} data	The data to be decrypted
 */
exports.decipher = function (data) {
	/* Local API Includes */
	var StringUtils = require('dw/util/StringUtils');
	var WeakCipher = require('dw/crypto/WeakCipher');

	if (empty(data) || typeof data !== 'string') {
		return new String();
	}
    var hashKey = Site.getCurrent().getCustomPreferenceValue("OrderGrooveMerchantHashKey");
    var hashKeyEncoded = StringUtils.encodeBase64(hashKey);
    var cipher = new WeakCipher();
    var dataDecrypted = cipher.decrypt(data, hashKeyEncoded, "AES/ECB/NOPADDING", "", 0);
    dataDecrypted = dataDecrypted.replace(new RegExp("{", "g"), "");
    return dataDecrypted;
};

/**
 * @function cardType
 *
 * Function converts the card type into a string number
 *
 * @param {string} data The card type data to be converted
 */
exports.cardType = function (data) {
    if (empty(data) || typeof data !== 'string') {
        return new String();
    }
	var ccType;
    switch (data.toUpperCase()) {
    case 'VISA':
        ccType = {name: 'Visa', code: '1'};
        break;
    case 'MASTER':
    case 'MASTER CARD':
    case 'MASTERCARD':
        ccType = {name: 'Master', code: '2'};
        break;
    case 'AMEX':
    case 'AMERICAN EXPRESS':
        ccType = {name: 'Amex', code: '3'};
        break;
    case 'DISCOVER':
        ccType = {name: 'Discover', code: '4'};
        break;
    case 'DINERS':
        ccType = {name: 'Diners', code: '5'};
        break;
    case 'JCB':
        ccType = {name: 'JCB', code: '6'};
        break;
    default:
        ccType = {name: '', code: ''};
    }
    return ccType;
};
