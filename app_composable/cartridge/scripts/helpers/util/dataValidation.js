'use strict';
const sitePrefs = dw.system.Site.current.preferences.custom;
const validationUtil = require('app_composable/cartridge/scripts/helpers/util/validationsUtil.js');

const dataValidation = {
    /* Email Validation with Regex */
    isValidEmail: function (data) {
        var email = new String(data).toLowerCase();
        return validationUtil.validateField('email', email);
    },

    /* Check data if empty and provide default value */
    emptyCheck(value, defVal) {
        return !empty(value) ? value : defVal;
    },

    emptyCheckAll(obj) {
        var arr = Object.values(obj);
        arr.forEach(function (item) {
            return empty(item);
        });
        return false;
    },

    /* Dynamic validation with Regex */
    isValidData: function (data, regex) {
        var checkData = new String(data).toLowerCase();
        var checkRegex = regex;

        if (!empty(checkData) && !empty(checkRegex)) {
            return checkRegex.test(checkData);
        }
    },

    /* Convert miliseconds to days */
    millisecondsToDays: function (milliseconds) {
        return (milliseconds / (60 * 60 * 24 * 1000));
    },

    validationMessageDatePattern: function () {
        return "MM/dd/yy 'at' h:mm a z";
    },

    normalizeDateString: function (dateString) {
        var isNormalizedMilliseconds = dateString.search(/([\d-])+T([\d:])+.\d{3}Z/) !== -1;
        return !isNormalizedMilliseconds ? dateString.split('Z')[0] + '.000Z' : dateString;
    },

    /* Checks preference and then also checks if prefernece is empty or has value. Otherwiwse send back the defaulted failed response / value */
    validSitePref: function (prefName, failResponse) {
        var result = failResponse;
        if (prefName in sitePrefs && !empty(prefName) && !empty(sitePrefs[prefName])) {
            result = sitePrefs[prefName];
        }
        return result;
    },

    isValidPassword: function (password) {
        // At least 8 & no more than 50 characters
        const eightToFifty = /^(?=.{8,50})/;
        // Contains at least one number (0-9)
        const numerical = /^(?=.*[0-9])/;
        // Contains at least one upper-case letter (A-Z)
        const capital = /^(?=.*[A-Z])/;
        // Contains at least one lower-case letter (a-z)
        const lowercase = /^(?=.*[a-z])/;
        // No space(s)
        const noSpaces = /^(?!.*\s)/;

        return eightToFifty.test(password) &&
            numerical.test(password) &&
            capital.test(password) &&
            lowercase.test(password) &&
            noSpaces.test(password);
    },

    /**
     * Check that a given name (first name, last name, etc) is valid and does not contain unacceptable characters
     * @function isValidName
     * @param {string} name The name of an individual
     * @returns {boolean}
     */
    isValidName: function(name) {
        const regex = new RegExp("^[ a-zA-Z0-9\'\’\-]+$");

        if (!regex.test(name)) {
            return false;
        }

        return true;
    },

    /**
     * Check that a given first name is valid and does not contain unacceptable characters
     * @function isValidFirstName
     * @alias isValidName
     * @param {string} name The first name of an individual
     * @returns
     */
    isValidFirstName: function(name) {
        return this.isValidName(name);
    },

    /**
     * Check that a given last name is valid and does not contain unacceptable characters
     * @function isValidLastName
     * @alias isValidName
     * @param {string} name The last name of an individual
     * @returns {boolean}
     */
    isValidLastName: function(name) {
        return this.isValidName(name);
    },

    /**
     * Check that a given string is sanitized/sterile and does not contain unacceptable characters
     * @function isSanitized
     * @param {string} str Input string
     * @returns {boolean}
     */
    isSanitized: function(str) {
        const regex = new RegExp("^[ a-zA-Z0-9]+$");

        if (!regex.test(str)) {
            return false;
        }

        return true;
    },

    /**
     * Check that a given US or CA phone number is valid
     * @function isValidPhoneNumber
     * @param {string} number US or CA phone number
     * @returns {boolean}
     */
    isValidPhoneNumber: function(number) {
        const regex = /(?=(?:^(?:\+?1\s*(?:[.-]\s*)?)?(?!(?:(?:.*\(.*)|(?:.*\).*)))(?:[2-9]1[02-9]|[2-9][02-8]1|[2-9][02-8][02-9]))|(?:.*\((?:[2-9]1[02-9]|[2-9][02-8]1|[2-9][02-8][02-9])\).*))(?:\+?1\s*(?:[.-]\s*)?)?(?:\(?([2-9]1[02-9]|[2-9][02-8]1|[2-9][02-8][02-9])\)?)\s*(?:[.-]\s*)?([2-9]1[02-9]|[2-9][02-9]1|[2-9][02-9]{2})\s*(?:[.-]\s*)?([0-9]{4})(?:\s*(?:#|x\.?|ext\.?|extension)\s*(\d{1,15}))?$/gm;

        if (!regex.test(number)) {
            return false;
        }

        return true;
    }
}

exports.dataValidation = dataValidation;

