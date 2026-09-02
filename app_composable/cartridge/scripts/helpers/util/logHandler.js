/**
 * A namespace.
 * @namespace logHandler
 */

'use strict';
const Logger = require('dw/system/Logger');
const StringUtils = require('dw/util/StringUtils');
//Centralized Bucketing
const BUCKET = ['CustomAPI','Hooks','SiteGenesis'];

//Handler object to dynamically log based on team if not default logging
var logHandler = {
	/**
	 * Logger object providing bucket-based and default logging methods at various severity levels.
	 *
	 * @memberof logHandler
	 * @type {Object}
	 */
	logger: {
		errorMessage: '',
        bucketLog: '',
        logMsg: '',
        isBucketed: false,
        /**
         * Prepares a verbose log message from an error object or string.
         * Extracts relevant details such as file name, line number, message, description, and stack trace
         *
         * @function prepareVerboseMsg
         * @memberof logHandler.logger
         * @param {string|Error} e - The error to format. Can be a plain string message or an Error object
         *     with properties such as `fileName`, `lineNumber`, `message`, `description`, and `stack`.
         * @returns {string} A formatted multi-line string containing the extracted error details.
         */
		prepareVerboseMsg: function (e){
            var msg = '';
            // Check if e is a string
            if (typeof e === 'string') {
                msg += 'message: ' + e + '\n';
                this.errorMessage = e;
            } else if (typeof e === 'object' && e !== null) {
                // Proceed with handling the object if it's an object
                msg += !empty(e.fileName) ? 'fileName: ' + e.fileName + '\n' : '';
                msg += !empty(e.lineNumber) ? 'lineNumber: ' + e.lineNumber + '\n' : '';
                msg += !empty(e.message) ? 'message: ' + e.message + '\n' : '';
                msg += !empty(e.description) ? 'description: ' + e.description + '\n' : '';
                msg += !empty(e.stack) ? 'stack: ' + e.stack + '\n' : '';
                this.errorMessage = !empty(e.message) ? e.message : '';
            } else {
                // fallback message if its neither format
                msg += 'Unknown error format.\n';
                this.errorMessage = 'Unknown error format.';
            }
            return msg;
        },
        /**
         * Resolves and returns a bucket logger name based on the provided bucket and optional component.
         * The resulting logger name is truncated to 25 characters.
         *
         * @function getBucketLogger
         * @memberof logHandler.logger
         * @param {string} bucket - The logging bucket category. Must match a value in the BUCKET array.
         * @param {string} [component] - An optional component name appended to the bucket (e.g. 'OrderFail').
         * @returns {string} The resolved bucket logger name, or an empty string if the bucket is not recognized.
         */
        getBucketLogger: function (bucket, component) {
            this.bucketLog = '';
            if (BUCKET.includes(bucket)) {
                this.bucketLog += bucket;
                if (!empty(component)) {
                    this.bucketLog += '_' + component;
                }
                this.bucketLog = StringUtils.truncate(this.bucketLog, 25, StringUtils.TRUNCATE_CHAR, '');
            }
            return this.bucketLog;
        },
        /**
         * Initializes internal logger state by resolving the bucket logger name,
         * preparing the verbose log message, and determining whether bucket-specific logging applies.
         *
         * @function setVariables
         * @memberof logHandler.logger
         * @param {string|Error} e - The error or message to log.
         * @param {string} bucket - The logging bucket category.
         * @param {string} [component] - An optional component name appended to the bucket.
         * @returns {void}
         */
        setVariables: function (e, bucket, component) {
            this.bucketLog = this.getBucketLogger(bucket, component);
            this.logMsg = this.prepareVerboseMsg(e);
            this.isBucketed = !empty(this.bucketLog);
        },
        /**
         * Logs an error-level message. If a valid bucket and optional component are provided,
         * the message is written to a bucket-specific custom log file; otherwise it is written
         * to the default system error log.
         *
         * @function error
         * @memberof logHandler.logger
         * @param {string|Error} e - The error or message to log.
         * @param {string} [bucket] - The logging bucket category (e.g. 'CustomAPI', 'Hooks').
         * @param {string} [component] - An optional component name appended to the bucket.
         * @returns {void}
         */
		error: function (e, bucket, component){
            this.setVariables(e, bucket, component);
            this.isBucketed ? Logger.getLogger(this.bucketLog, 'error').error(this.logMsg) : Logger.error(this.logMsg);
		},
        /**
         * Logs a debug-level message. If a valid bucket and optional component are provided,
         * the message is written to a bucket-specific custom log file; otherwise it is written
         * to the default system debug log.
         *
         * @function debug
         * @memberof logHandler.logger
         * @param {string|Error} e - The error or message to log.
         * @param {string} [bucket] - The logging bucket category (e.g. 'CustomAPI', 'Hooks').
         * @param {string} [component] - An optional component name appended to the bucket.
         * @returns {void}
         */
		debug: function (e, bucket, component){
            this.setVariables(e, bucket, component);
            this.isBucketed ? Logger.getLogger(this.bucketLog).debug(this.logMsg) : Logger.debug(this.logMsg);
		},
        /**
         * Logs an info-level message. If a valid bucket and optional component are provided,
         * the message is written to a bucket-specific custom log file; otherwise it is written
         * to the default system info log.
         *
         * @function info
         * @memberof logHandler.logger
         * @param {string|Error} e - The error or message to log.
         * @param {string} [bucket] - The logging bucket category (e.g. 'CustomAPI', 'Hooks').
         * @param {string} [component] - An optional component name appended to the bucket.
         * @returns {void}
         */
		info: function (e, bucket, component){
            this.setVariables(e, bucket, component);
            this.isBucketed ? Logger.getLogger(this.bucketLog).info(this.logMsg) : Logger.info(this.logMsg);
		},
        /**
         * Logs a warn-level message. If a valid bucket and optional component are provided,
         * the message is written to a bucket-specific custom log file; otherwise it is written
         * to the default system warn log.
         *
         * @function warn
         * @memberof logHandler.logger
         * @param {string|Error} e - The error or message to log.
         * @param {string} [bucket] - The logging bucket category (e.g. 'CustomAPI', 'Hooks').
         * @param {string} [component] - An optional component name appended to the bucket.
         * @returns {void}
         */
        warn: function (e, bucket, component){
            this.setVariables(e, bucket, component);
            this.isBucketed ? Logger.getLogger(this.bucketLog).warn(this.logMsg) : Logger.warn(this.logMsg);
		},
        /**
         * Logs detailed information about a failed order, including order details, customer information,
         * shipping address, product line items, payment method, and total price.
         *
         * @function failOrderAddLogInformation
         * @memberof logHandler.logger
         * @param {dw.order.LineItemCtnr} order - The order object containing data about the failed order. Must provide methods and properties such as `orderNo`, `getCustomerName`, `getCustomerEmail`, `getBillingAddress`, `getShippingAddress`, `getProductLineItems`, `paymentInstruments`, and `getTotalGrossPrice`.
         * @param {string} errorCode - The error code associated with the order failure.
         * @return {void} This function does not return a value.
         */
        failOrderAddLogInformation : function (order, errorCode) {
            let errorMessage = '';
            let billingAddress = order.getBillingAddress();
            errorMessage += 'Error code: ' + errorCode + '\n';
            errorMessage += 'Customer name: ' + billingAddress.firstName + ' ' + billingAddress.lastName + '\n';
            errorMessage += 'Customer email: ' + order.getCustomerEmail() + '\n';
            errorMessage += 'Phone: ' + billingAddress.phone + '\n';
            const shippingAddress = order.getDefaultShipment().getShippingAddress();
            let shippingAddressString = '';
            if (!empty(shippingAddress)) {
                shippingAddressString += shippingAddress.address1 + ' ';
                shippingAddressString += (shippingAddress.address2 ? shippingAddress.address2 : '') + ' ';
                shippingAddressString += shippingAddress.city + ' ';
                shippingAddressString += shippingAddress.stateCode + ' ';
                shippingAddressString += shippingAddress.postalCode + ' ';
                shippingAddressString += shippingAddress.countryCode + ' \n';
                shippingAddressString += shippingAddress.phone;
                errorMessage += 'Shipping address:' + shippingAddressString + '\n';
            }

            const productLineItems = order.getProductLineItems().toArray();
            if (productLineItems.length) {
                let productMessage = '';
                productLineItems.forEach(pli => {
                    productMessage += 'ID: ' + pli.product.ID + ' qty: ' + pli.quantity + ';';
                });
                if (productMessage) {
                    errorMessage += 'Product line items: ' + productMessage + '\n';
                }
            }

            const paymentInstruments = order.getPaymentInstruments().toArray();
            if (paymentInstruments.length) {
                const paymentInstrument = paymentInstruments.shift();
                errorMessage += 'Payment method: ' + paymentInstrument.getPaymentMethod() + '\n';
                errorMessage += !empty(paymentInstrument.getPaymentTransaction().paymentProcessor) ? 'Payment processor: ' + paymentInstrument.getPaymentTransaction().paymentProcessor.ID + '\n' : null;
            }

            errorMessage += 'Order total: ' + order.getTotalGrossPrice()

            this.warn(errorMessage, 'Hooks', 'OrderFail');
        }
	}
}

exports.logHandler = logHandler;
