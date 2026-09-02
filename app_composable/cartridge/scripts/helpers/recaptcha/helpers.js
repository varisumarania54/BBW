'use strict'

const reCaptcha = require('app_composable/cartridge/scripts/services/recaptcha.js');

var  RateLimitCheck = function(pageID, rateLimit){
    return empty(request.session.custom.recaptchaState) || request.session.custom.recaptchaState[pageID].Counter >= rateLimit
}
exports.updateRecaptchaInfo = function (pageID, recaptchaEnabled, recaptchaRateLimit) {
    var recaptchaInfo = request.session.custom.recaptchaState ? JSON.parse(request.session.custom.recaptchaState) : {};
    recaptchaInfo[pageID] = !empty(recaptchaInfo[pageID]) ? recaptchaInfo[pageID] : {};
    recaptchaInfo[pageID].Counter = recaptchaInfo[pageID].Counter ? recaptchaInfo[pageID].Counter + 1 : 1

    recaptchaInfo[pageID].DisplayFlag = recaptchaEnabled && RateLimitCheck(pageID,recaptchaRateLimit) ? true : false;

    request.session.custom.recaptchaState = JSON.stringify(recaptchaInfo);
}

exports.assessToken = function (recaptchaToken) {

    //evaluate provided token if it exists
    var reCaptchaResult = validate(recaptchaToken);

    /**
     * reCaptcha service down
     */
    if (empty(reCaptchaResult)) {
        return {
            msg: "billing.giftcert.error.recaptchasystem",
            status: 'SYSTEM-DOWN'
        }
    }

    /**
     * reCaptcha validation failed
     */
    if (reCaptchaResult.success == false) {
        return {
            msg: "billing.giftcert.error.recaptchavalidation",
            status: "ERROR"
        }
    }
    // MISSING
    /**
     * return success if no problems
     */
    return {
        status: "SUCCESS"
    }
}

function validate(token : String){
        var result = {success: false};
        var secretKey = dw.system.Site.getCurrent().getCustomPreferenceValue('RecaptchaPrivateKey');
        var params = [
            'secret=' + secretKey,
            'response=' + token
        ];

        var response = reCaptcha.service.call(params.join('&'));
        if (response.isOk()) {
            result = JSON.parse(response.object);
        }

        return result;
    }

exports.RateLimitCheck = RateLimitCheck;
