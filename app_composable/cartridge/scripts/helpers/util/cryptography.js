'use strict'

/**
 * Util helpers for cryptography encrypt/decrypt methods
 * @namespace cryptography
 */
const MessageDigest = require('dw/crypto/MessageDigest');
const Bytes = require('dw/util/Bytes');
const Cipher = require('dw/crypto/Cipher');
const SecureRandom = require('dw/crypto/SecureRandom');
const Encoding = require('dw/crypto/Encoding');
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;
/**
 * Converts string into hashed hexidecimal string
 * @function hash
 * @memberof cryptography
 * @param {String} string - string to be hashed and turned into hexidecimal
 * @return {String|null} - hexidecimal string or null
 */
function hash(string) {
    if (!string) {
        return null;
    }
    const bytes = new Bytes(string.toLowerCase());
    const hash = new MessageDigest(MessageDigest.DIGEST_SHA_256).digestBytes(bytes);
    return Encoding.toHex(hash);
}

/**
 * Converts string into iv + encrypted string
 * @function encrypt
 * @memberof cryptography
 * @param {String} plainText - string that will be encrypted
 * @param {String} encryptionKey - 32 bytes (256 bits) $openssl rand -base64 32
 * @return {String|undefined} - encrypted text or undefined
 */
function encrypt(plainText, encryptionKey) {
    let result;
    try {
        const cipher = new Cipher();
        const secureRandom = new SecureRandom();
        let iv = Encoding.toBase64(secureRandom.generateSeed(16));
        let encryptedStr = cipher.encrypt(plainText, encryptionKey, 'AES/CBC/PKCS5Padding', iv, 1);
        let encryptedData = new Bytes(iv.concat(encryptedStr));
        result = Encoding.toBase64(encryptedData);
    } catch (e) {
        logHandler.logger.error(e, 'cryptography', 'encrypt');
    }
    return result;
}

/**
 * Converts encrypted string to plain text
 * @function decrypt
 * @memberof cryptography
 * @param {String} encryptedText - string that will be encrypted
 * @param {String} encryptionKey - 32 bytes (256 bits) $openssl rand -base64 32
 * @return {String|undefined} - encrypted text or undefined
 */
function decrypt(encryptedText, encryptionKey) {
    let result;
    try {
        const cipher = new Cipher();
        let encryptedString = Encoding.fromBase64(encryptedText).toString();
        let iv = encryptedString.slice(0, 24).toString();
        let encrypted = encryptedString.slice(24);
        result = cipher.decrypt(encrypted, encryptionKey, 'AES/CBC/PKCS5Padding', iv, 1);
    } catch (e) {
        logHandler.logger.error(e, 'cryptography', 'decrypt');
    }
    return result;
}

module.exports = {
    hash,
    encrypt,
    decrypt
};
