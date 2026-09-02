'use strict'
/**
 * Recaptcha Token Validation
 * @namespace recaptchaValidation
 */

const errorHandler = require('app_composable/cartridge/scripts/helpers/util/errorHandler').errorHandler;
const sitePrefHelper = require('app_composable/cartridge/scripts/helpers/util/sitePrefHelper');
const Resource = require('dw/web/Resource');
const Site = require('dw/system/Site');

// CONSTANTS CONFIGURATION
const PRIVATE_KEY_VISIBLE = 'RecaptchaPrivateKey';
const PRIVATE_KEY_INVISIBLE = 'InvisibleRecaptchaPrivateKey';
const ACCOUNT = 'EnableCustomerTeamCaptcha';
const CHECK_ACCOUNT = {
    enabled: 'EnableCheckAccountCaptcha',
    visible: false
}
const CREATE_ACCOUNT = {
    enabled: 'EnableCreateAccountCaptcha',
    bodyAttributePath: 'customer',
    visible: false
}
const ORDER_DETAILS = {
    enabled: 'EnableOrderTrackingCaptcha',
    visible: true
}
const TRANSACTION = 'EnableTransactionTeamCaptcha';
const BILLINGGC = {
    enabled: 'enableBillingRecaptcha',
    visible: true
}
const CHECKBALANCEGC = {
    enabled: 'EnableGiftCardRecaptcha',
    visible: true
}
const ANDROIDGC = {
    enabled: 'enableBillingRecaptcha',
    captchaKeyID: 'RecaptchaAndroidKey',
    enterprise: true
}
const IOSGC = {
    enabled: 'enableBillingRecaptcha',
    captchaKeyID: 'RecaptchaIOSKey',
    enterprise: true
}
const PAYMENTINSTRUMENT ={
    enabled: 'EnablePaymentInstrumentRecaptcha',
    visible: false
}
const ANDROIDPAYMENTINSTRUMENT = {
    enabled: 'EnablePaymentInstrumentRecaptcha',
    captchaKeyID: 'RecaptchaAndroidKey',
    enterprise: true
}
const IOSPAYMENTINSTRUMENT = {
    enabled: 'EnablePaymentInstrumentRecaptcha',
    captchaKeyID: 'RecaptchaIOSKey',
    enterprise: true
}


/**
* Calls google recaptcha endpoint to validate token
* @function validateToken
* @memberof recaptchaValidation
* @param {Object} customPreferenceKey - constant defines team level on/off
* @param {Object} options - constant defines feature level on/off
* @param {String} [errorResourcePath] - optional path for error message resources
* @param {Boolean} [enterprise] - true if the enteprise google api is desired
* @param {String} [action] - the action to send to google for captcha check
* @returns {Object|null} Returns error object or null on success
*/
function validateToken(customPreferenceKey, options, errorResourcePath, action) {
    if (sitePrefHelper.getSitePrefValue(customPreferenceKey) && sitePrefHelper.getSitePrefValue(options.enabled)) {
        const bodyAttributePath = options.bodyAttributePath || null;
        const token = getTokenFromRequest(bodyAttributePath);
        const resourceId = errorResourcePath || 'composable/recaptcha';
        const errorMessages = {
            missingToken: Resource.msg('error.recaptcha.missingtoken', resourceId, null),
            invalidToken: Resource.msg('error.recaptcha.invalidtoken', resourceId, null),
            noKey: Resource.msg('error.recaptcha.invalidtoken', resourceId, null)
        };

        if (!token) {
            return new errorHandler.newError('Recaptcha Error', errorMessages.missingToken, 400, 'recaptchaValidation.js');
        }
        const recaptcha = require('app_composable/cartridge/scripts/services/recaptcha');
        if (options.enterprise) {
            let privateKey = Site.getCurrent().getCustomPreferenceValue(options.captchaKeyID);
            if (!privateKey) {
                return new errorHandler.newError('Recaptcha Error', errorMessages.missingToken, 400, 'recaptchaValidation.js');
            }
            let validationResponse = recaptcha.enterpriseService.call({ token, privateKey, action });
            if (!validationResponse.ok) {
                return new errorHandler.newError('Recaptcha Error', validationResponse.errorMessage, 500, 'recaptchaValidation.js');
            }

            let result = validationResponse.getObject();
            if (!result.tokenProperties.valid) {
                return new errorHandler.newError('Recaptcha Error', errorMessages.invalidToken, 400, 'recaptchaValidation.js');
            }
        }
        else {
            const isVisibleRecaptcha = options.visible;
            let privateKey = getPrivateKey(isVisibleRecaptcha);
            let validationResponse = recaptcha.service.call({ token, privateKey });
            if (!validationResponse.ok) {
                return new errorHandler.newError('Recaptcha Error', validationResponse.errorMessage, 500, 'recaptchaValidation.js');
            }

            let result = validationResponse.getObject();
            if (!result.success) {
                return new errorHandler.newError('Recaptcha Error', errorMessages.invalidToken, 400, 'recaptchaValidation.js');
            }
        }
    }
    return null;
}

/**
* Calls google recaptcha endpoint to validate token
* @function getTokenFromRequest
* @memberof recaptchaValidation
* @param {Object} bodyAttributePath - dot notation string of where to find the token
* @returns {String|null} Returns token or null if not found in request
*/
function getTokenFromRequest(bodyAttributePath) {
    const httpParameterMap = request.getHttpParameterMap();
    const tokenAttributeKey = 'c_recaptcha_token';
    let token = httpParameterMap.get(tokenAttributeKey).getStringValue();
    const requestBody = httpParameterMap.requestBodyAsString ? JSON.parse(httpParameterMap.requestBodyAsString) : {};
    if (!token && bodyAttributePath && httpParameterMap.requestBodyAsString) {
        const tokenPath = bodyAttributePath.concat('.', tokenAttributeKey);
        token = tokenPath.split('.').reduce((collection, key) => collection && collection[key], requestBody);
    }
    if (!token && !bodyAttributePath && httpParameterMap.requestBodyAsString) {
        token = requestBody[tokenAttributeKey];
    }
    return token;
}

/**
* Gets the correct private key based on captcha type
* @function getPrivateKey
* @memberof recaptchaValidation
* @param {Object} isVisibleRecaptcha - true if type is visible and false if invisible
* @returns {String|null} Returns private key or null if missing on environment
*/
function getPrivateKey(isVisibleRecaptcha) {
    let key = isVisibleRecaptcha ? PRIVATE_KEY_VISIBLE : PRIVATE_KEY_INVISIBLE;
    return Site.getCurrent().getCustomPreferenceValue(key);
}

function checkCaptchaTokenValidity(pageID, recaptchaToken, recaptchaEnabled) {
    const RecaptchaHelpers = require('app_composable/cartridge/scripts/helpers/recaptcha/helpers.js');
    if (recaptchaEnabled) {
        if (empty(recaptchaToken)) {
            return { status: "MISSING" };
        }
        const tokenValidationObj = RecaptchaHelpers.assessToken(recaptchaToken);
        return tokenValidationObj
    } else {
        return { status: "NA" };
    }
}

/**
* Gets the correct config based on the platform
* @function decideKeyConfigFromPlatform
* @memberof recaptchaValidation
* @param {String} platform - the value of the platform passed
* @param {Object} defaultConfig - the legacy default if no platform matches
* @returns {Object} Returns the configuration needed
*/
function decideKeyConfigFromPlatform(platform, defaultConfig,action) {
    const configMap = {
        "android": {
            "GIFT_CARD": ANDROIDGC,
            "PAYMENT": ANDROIDPAYMENTINSTRUMENT
        },
        "ios": {
            "GIFT_CARD": IOSGC,
            "PAYMENT": IOSPAYMENTINSTRUMENT
        }
    }
    return configMap[platform] ? configMap[platform][action] : defaultConfig;
}


module.exports = {
    ACCOUNT,
    CHECK_ACCOUNT,
    CREATE_ACCOUNT,
    ORDER_DETAILS,
    TRANSACTION,
    BILLINGGC,
    CHECKBALANCEGC,
    PAYMENTINSTRUMENT,
    validateToken,
    checkCaptchaTokenValidity,
    decideKeyConfigFromPlatform
}
