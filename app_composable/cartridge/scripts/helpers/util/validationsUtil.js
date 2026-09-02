'use strict';

const Site = require('dw/system/Site').getCurrent();
const errorHandler = require('app_composable/cartridge/scripts/helpers/util/errorHandler.js').errorHandler;
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;

/**
 * Validates the shopperContext against the allowed keys for a given clientId.
 *
 * @param {string} clientId - The unique identifier for the client.
 * @param {Object} shopperContext - The context data to be validated, which includes various keys and values.
 *
 * @returns {Array<string>|null} - An array of not allowed keys, or `null` if all keys are valid.
 * @throws {Error} - Throws an error if the clientId is invalid or if the registry is improperly configured.
 */
function validateContext(clientId, shopperContext) {
	let clientRegistry = getClientRegistry();
	let notAllowedKeys = [];

    if (!(clientId in clientRegistry)) {
		throw new errorHandler.error('VALIDATE-FIELD-04-011', clientId);
    }

    if (clientRegistry[clientId].includes('all')) {
        return null;
    }

	for (let key in shopperContext) {
		if (key == 'customQualifiers' && shopperContext[key] !== null) {
			for (let field in shopperContext['customQualifiers']){
				if (shopperContext['customQualifiers'][field] != null &&
                    !clientRegistry[clientId].includes('customQualifiers:'+field)){
						notAllowedKeys.push('customQualifiers:'+field);
				}
			}
		} else if (shopperContext[key] != null &&
            !clientRegistry[clientId].includes(key)) {
				notAllowedKeys.push(key);

		}
	}

	return notAllowedKeys;
}

/**
 * Validates the incoming request payload based on specific conditions and regular expressions.
 * This function performs multiple validation steps, including checking for valid properties
 * based on a custom preference value and validating input fields using regular expressions.
 * If validation fails, an error is logged and thrown.
 *
 * @function validateResponse
 * @memberof Util
 * @param {Object} payload - The request payload to be validated. This is an object containing the data to be validated.
 * @param {string} type - The type of the request(Customer-Attributes, Basket-Attributes), used to check whether a property is valid or not.
 * @throws {errorHandler.error} - Throws an error if any validation fails, with specific error codes and field names.
 */
function validateRequest(payload , type ) {
    const validateRequestAttribute = Site.getCustomPreferenceValue('validateRequestAttribute');
	let fieldValidationError = [];

	// Check if validation is enabled in the custom preferences
    if (!empty(validateRequestAttribute) && validateRequestAttribute){
        if (fetchAppType(request) == 'SCAPI'){
			const scapiRequestAttributesList = require('app_composable/cartridge/requestAttributeLists').SCAPI;
			let attributeList = scapiRequestAttributesList[type]
			// Get all keys from the payload and filter invalid ones based on the request type
			fieldValidationError = validateKey(payload, attributeList);
        }
    }

	// If any invalid fields are found, log the errors and throw an exception
    if (!empty(fieldValidationError)) {
        logHandler.logger.error({message: fieldValidationError}, 'Hooks', 'UpdateCustomer');
        throw new errorHandler.error('VALIDATE-FIELD-04-003', `${fieldValidationError.join(', ')}`);
    }

	// Validate input fields using regular expressions
	let countryCode =  getCountryCode(payload);
	fieldValidationError = validateInputRegularExpressions(payload, countryCode);

	// If validation errors are found, log the errors and throw an exception
	if (!empty(fieldValidationError)) {
        logHandler.logger.error({message: fieldValidationError}, 'Hooks', 'UpdateCustomer');
        throw new errorHandler.error('VALIDATE-FIELD-04-009', `${fieldValidationError.join(', ')}`);
    }
}

/**
 * Validates CIAM request payload attributes against blocked attributes defined in site preferences
 * @param {Object} payload - Request payload to validate
 */
function validateCIAMattributes(payload) {
    let validateCIAMRequestAttribute = {};

    try {
        validateCIAMRequestAttribute = JSON.parse(Site.getCustomPreferenceValue('CIAMBlockedAttributes'));
    } catch (e) {
        throw new errorHandler.newError('CIAM JSON Error', 'Invalid JSON Object / Preferences', 400, 'validationsUtil.js');
    }
     
    let fieldValidationError = [];

    if (!empty(validateCIAMRequestAttribute)){
		// Get all keys from the payload and filter invalid ones based on the request type
		fieldValidationError = validateKey(payload, validateCIAMRequestAttribute);
    }

    // If any invalid fields are found, log the errors and throw an exception
    if (!empty(fieldValidationError)) {
        logHandler.logger.error({message: fieldValidationError}, 'Hooks', 'UpdateCustomer');
        throw new errorHandler.error('CIAM-01-006', `${fieldValidationError.join(', ')}`);
    }
}

/**
 * Validates the request body based on the provided type.
 * The request body is parsed and the validation is done based on the specified type.
 * If the validation fails, an error is logged and thrown.
 *
 * @function validateRequestBody
 * @memberof Util
 * @param {string} type - The type of the request, used to determine whether a property is valid or not.
 */
function validateRequestBody(type) {
    // parse the request body
    const requestBodyStr = request.getHttpParameterMap().getRequestBodyAsString();
    const requestBodyObject = JSON.parse(requestBodyStr);

    // validate the request body
    // the validation should be done based on the Basket-Attributes
    // if the validation fails, an error is logged and thrown
    validateRequest(requestBodyObject, type);
}

/**
 * Validates the response payload and removes invalid fields based on a custom preference setting.
 * It checks the payload for fields that are not valid according to the specified request type.
 * If a field is invalid, it is removed from the response payload.
 *
 * @function validateResponse
 * @memberof Util
 * @param {Object} payload - The response payload object to be validated and possibly modified.
 * @param {string} type - The type of the request, used to determine whether a property is valid or not.
 */
function validateResponse(payload, type) {
	const validateResponseAttribute = Site.getCustomPreferenceValue('validateResponseAttribute');

	// If validation is enabled in the custom preferences
    if (!empty(validateResponseAttribute) && validateResponseAttribute){
        if (fetchAppType(request) == 'SCAPI'){
			// Get the attribute list from the JSON object for the request type
			const scapiResponseAttributesList = require('app_composable/cartridge/responseAttributeLists').SCAPI;
			let attributeList = scapiResponseAttributesList[type];

			// Get all keys in the payload and filter out invalid ones based on the request type.
			const fieldsToBeRemoved = validateKey(payload, attributeList);

			// Remove all invalid fields
			fieldsToBeRemoved.forEach(field => removeNestedField(payload, field));
        }
    }
}

/**
 * Validates the fields in the provided API request using regular expressions and the country code.
 * Traverses the nested structure of the payload recursively and validates each field.
 * Returns an array of invalid field names.
 *
 * @function validateInputRegularExpressions
 * @memberof Util
 * @param {Object} payload - The input object that contains the data to validate. It can be a nested object.
 * @param {String} countryCode - Country code (US, CA )
 * @returns {Array<string>} - An array containing the names of invalid fields that didn't pass the validation.
 */
function validateInputRegularExpressions (payload, countryCode) {
	let errors = [];
	Object.keys(payload).forEach(key => {
		let value = payload[key];
		if (value !== null) {
			if (typeof value === 'object' && Object.keys(payload[key]).length > 0) {
				errors = errors.concat(validateInputRegularExpressions(value, countryCode));
			} else if (!validateField(key, value, countryCode)){
				errors.push(key);
			}
		}
	});

	return errors;
}

/**
 * validateField: Validate the input filed value based on store Regex in site pref
 * @function validateField
 * @memberof Util
 * @param {String} type - Field Type (firstName, lastName , email etc)
 * @param {String} [countryCode] - Country code (US, CA )
 * @returns {boolean} : Return the regex validation result.
 */

function validateField(type, value, countryCode) {
	try {
		const fieldRegex = getFieldRegex(type, countryCode);
		const regex = new RegExp(fieldRegex);

		if (type === 'countryCode' || type === 'stateCode') {
			return fieldRegex.includes(value);
		} else if (type === 'phone' || type === 'phoneHome' || type === 'phoneMobile') {
            return validatePhone(value, regex);
        } else {
			return regex.test(value);
		}
	} catch (e) {
		logHandler.logger.error(e, 'ValidationUtil', 'GetFieldRegex');
	}
}

/**
 * Validates a phone number against a regular expression and checks for specific area codes.
 * The function removes all special characters from the phone number and checks if the area code
 * and central office code are valid. It also checks against a list of non-personal area codes
 * and N11 service codes that should be rejected.
 *
 * @function validatePhone
 * @memberof ValidationUtil
 * @param {string} value - The phone number to be validated.
 * @param {RegExp} regex - The regular expression to validate the phone number format.
 * @returns {boolean} - Returns `true` if the phone number is valid, `false` otherwise.
 */
function validatePhone(value, regex) {
    // Remove all special characters from the value
    value = value.replace(/[^a-zA-Z0-9]/g, "");
    const areaCode = value.slice(0, 3);
    const centralOfficeCode = value.slice(3, 6);

    // N11 Service Codes that should be rejected in the central office position
    // taken from https://en.wikipedia.org/wiki/North_American_Numbering_Plan
    const n11ServiceCodes = [
        "211",
        "311",
        "411",
        "511",
        "611",
        "711",
        "811",
        "911",
    ];

    if (n11ServiceCodes.includes(centralOfficeCode)) {
        return false;
    }

    /**
     * Non-personal phone numbers to reject based on area code.
     * Sources:
     * - Premium rate & toll-free numbers: https://en.wikipedia.org/wiki/Toll-free_telephone_number#United_States
     * - Area codes: https://en.wikipedia.org/wiki/North_American_Numbering_Plan#Numbering_system
     * - Special codes: https://en.wikipedia.org/wiki/North_American_Numbering_Plan#Service_codes
     */
    const nonPersonalAreaCodes = [
        // Toll-free numbers
        "800",
        "888",
        "877",
        "866",
        "855",
        "844",
        "833",
        "822",

        // Premium Rate Services
        "900",
        "976",

        // Other special service numbers
        // Directory assistance
        "555",
        // Local test numbers
        "958",
        // Local test numbers
        "959",
        // Personal communication services
        "970",

        // Test numbers
        "991",
        "992",
        "993",
        "994",
        "995",
        "996",
        "997",
        "998",
        "999",
    ];

    if (nonPersonalAreaCodes.includes(areaCode)) {
        return false;
    }

    return regex.test(value);
}

/**
 * Recursively removes a specified field from a nested JSON-like object (or array).
 *
 * This function will traverse all levels of the input object and remove any key-value pairs where
 * the key matches the specified field name. It works on nested objects and arrays as well.
 * @function removeNestedField
 * @memberof Util
 *
 * @param {Object|Array} payload - The object or array to remove the field from.
 * @param {string} field - The field name (key) to remove from the object or array.
 */
function removeNestedField (payload, field)  {
	Object.keys(payload).forEach(key => {
		// If the value is an object, recursively remove the field from nested objects
		if (typeof payload[key] === 'object' && payload[key] !== null && Object.keys(payload[key]).length > 0) {
			removeNestedField(payload[key], field);
		}
		// If the field matches, delete it
		else if (key == field) {
			delete payload[key];
		}
	});
}

/**
 * Recursively retrieves all the keys from a nested object.
 * This function traverses the entire object, including nested objects,
 * and returns an array of all keys in the object that have a non-null, non-empty value.
 *
 * @function validateKey
 * @memberof Util
 * @param {Object} payload - The object from which the keys are to be extracted. This can be a deeply nested object.
 * @param {Object} attributeList - Atributes List for specific type of Request type, which is used to determine the corresponding blocked and allowed lists.
 * @returns {Array<string>} - An array of strings representing all keys in the object that have a non-null, non-empty value.
 */
function validateKey (payload, attributeList) {
 	let keys =[];

    Object.keys(payload).forEach(key => {
        // If the value is a non-null object with nested keys, recursively extract keys
        if (typeof payload[key] === 'object' && payload[key] !== null && Object.keys(payload[key]).length > 0) {
            keys = keys.concat(validateKey(payload[key], attributeList));
        }
        // If the value is non-null and non-empty, add the key to the keys array
        else if (payload[key] && !isValidProperty(key, attributeList)) {
            keys.push(key);
        }
    });

    return keys;
}

/**
 * The function compares the key against a blocked list and an allowed list, both of which are defined in the `attributeLists` JSON for the given type.
 * A property is considered valid if it is present in the allowed list and not present in the blocked list.
 *
 * @function isValidProperty
 * @memberof Util
 * @param {string} key - The property name to be validated.
 * @param {Object} attributeList - Atributes List for specific type of Request type, which is used to determine the corresponding blocked and allowed lists.
 * @returns {boolean} - Returns `true` if the property is allowed and not blocked, `false` otherwise.
 */
function isValidProperty(key, attributeList) {
    const blockedList = attributeList.blockList;
    const allowedList = attributeList.allowList;

    // Check if the key is not in the blocked list and is present in the allowed list
    if (!empty(blockedList) && (blockedList.includes(key))){
        return false;
    } else if (!empty(allowedList) && !(allowedList.includes(key))){
		return false;
	}

    return true;
}

/**
 * Determines the application type based on the provided request.
 * This function checks if the request is of type "SCAPI" using the `isSCAPI` method.
 *
 * @function fetchAppType
 * @memberof Util
 * @param {Object} request - The request object that contains information about the request type.
 * @returns {string|undefined} - Returns `"SCAPI"` if the request type is SCAPI, or `undefined` if the request type is not SCAPI.
 */
function fetchAppType(request) {
    if (request.isSCAPI()) {
        return "SCAPI";
    }
}

/**
 * Retrieves and parses the client registry from custom preferences.
 *
 * @returns {Object} - The parsed client registry object.
 * @throws {Error} - Throws an error if the registry is not properly configured or can't be parsed.
 */
function getClientRegistry() {

	try {
		return JSON.parse(
			Site.getCustomPreferenceValue('shopperContextHooksClientRegistry')
		);
	} catch (e) {
		throw new errorHandler.error('VALIDATE-FIELD-04-010', 'shopperContextHooksClientRegistry');
	}
}

/**
 * Retrieves the shopper context flag value from the custom preferences.
 * If an error occurs while fetching the value, it returns `false` by default.
 *
 * @returns {boolean} Returns `true` if the shopper context flag is enabled, otherwise `false`.
 */
function getShopperContextFlag() {
	return Site.getCustomPreferenceValue('shopperContextEnable') ?
				Site.getCustomPreferenceValue('shopperContextEnable') : false;

}

/**
 * Recursively searches the given payload for a "countryCode" key and returns its value.
 * This function traverses the payload, including nested objects, and returns the first
 * occurrence of a "countryCode" key found in the object.
 *
 * @function getCountryCode
 * @memberof Util
 * @param {Object} payload - The object to be searched for the "countryCode" key. This object can be deeply nested.
 * @returns {string} - The value of the "countryCode" key, or an empty string if the key is not found.
 */
function getCountryCode(payload) {
	let countryCode = '';
	// Traverse the object keys
	Object.keys(payload).forEach(key => {
		// If the value is an object, recursively call getCountryCode
		if (typeof payload[key] === 'object' && payload[key] !== null && Object.keys(payload[key]).length > 0) {
			countryCode = getCountryCode(payload[key]);
		}
		// If the countryCode key is found and matches default country code, assign its value
		else if (key === 'countryCode' && payload[key]) {
			countryCode = payload[key];
		}
	});

	return countryCode;
}

/**
 * getFieldRegex : fetching the regex for the input field and return
 * @function validateField
 * @memberof Util
 * @param {String} type - Field Type (firstName, lastName , email etc)
 * @param {String} countryCode - Country code (US, CA )
 * @returns {String} : Return the regex string.
 */
function getFieldRegex (type, countryCode) {

	const valueRegexJson  = Site.getCustomPreferenceValue('fieldRegexValue');

	if (!empty(valueRegexJson)) {
		try {
			const fieldRegex = JSON.parse(valueRegexJson);
			return fieldRegex[countryCode] && fieldRegex[countryCode][type] || fieldRegex[type];
		} catch (e) {
			   throw new errorHandler.error('VALIDATE-FIELD-04-002', type);

		}
	} else {
		 throw new errorHandler.error('VALIDATE-FIELD-02-001');
	}
}

exports.validateField = validateField;
exports.validateRequest = validateRequest;
exports.validateResponse = validateResponse;
exports.validateRequestBody = validateRequestBody;
exports.validateContext = validateContext;
exports.getShopperContextFlag = getShopperContextFlag;
exports.validateCIAMattributes = validateCIAMattributes;
