'use strict';

const errorCodes = require('app_composable/cartridge/errorcodes').errors;
const StringUtils = require("dw/util/StringUtils");
const Status = require('dw/system/Status');

const errorHandler = {

    /**
     * Dynamic Api Error Handling
     * @deprecated
     *
     * @param {string} name - The name of the error.
     * @param {string} message - The error message.
     * @param {number} httpCode - The HTTP status code associated with the error.
     * @param {string} fileName - The name of the file where the error occurred.
     * @param {number} lineNumber - The line number in the file where the error occurred.
     * @param {string} stack - The stack trace associated with the error.
     */
    newError: function (name, message, httpCode, fileName, lineNumber, stack) {
        this.name = name;
        this.message = message;
        this.httpCode = httpCode;
        this.fileName = fileName;
        this.lineNumber = lineNumber;
        this.stack = stack;
    },


    /**
     * error: Update the all attributes value in newly created Error object
     * @function error
     * @memberof errorHandler
     * @param {String} errorCode - error code
     * @param {Object} args - Array of object
     */
    error: function (errorCode, args) {
        const error_info = errorCodes[errorCode];
        this.error_code = errorCode;
        this.message = empty(args) ? error_info.message : StringUtils.format(error_info.message, args);
        this.description = empty(args) ? error_info.description : StringUtils.format(error_info.description, args);
        this.httpCode = error_info.httpCode;
        this.severity = error_info.severity;
    },

    /**
     * Retrieves the error message from the error code
     * @function getErrorMessage
     * @memberof errorHandler
     * @param {String} errorCode - error code
     * @param {Object} args - Array of object
     * @returns {String} The error message
     */
    getErrorMessage(errorCode, args) {
        this.error(errorCode, args);
        if (this.message) {
            return this.message;
        }
        return '';
    },

    errorStatus: function (errorCode, args) {
        const error_info = errorCodes[errorCode];
        return !empty(error_info) ? new Status(Status.ERROR, error_info.httpCode.toString(), error_info.message) : null;
    }
}

exports.errorHandler = errorHandler;

