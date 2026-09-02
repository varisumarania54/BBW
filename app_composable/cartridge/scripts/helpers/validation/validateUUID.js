'use strict';

const { validateField } = require('app_composable/cartridge/scripts/helpers/util/validationsUtil.js');

/**
 * Validates if a string is a valid UUID (version 4)
 * @function isValidUUID
 * @param {string} str - The string to validate
 * @returns {boolean} True if the string is a valid UUID, false otherwise
 */

// Grabs the regex from the fieldRegexValue in Composable site pref group, using the key "customerNoUUID", throws error if it doesn't exist.

function isValidUUID(str) {
    return validateField("customerNoUUID", str);
}

module.exports = {
  isValidUUID
};
