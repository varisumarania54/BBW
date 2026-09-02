'use strict'
const GiftCardService = require('int_radial_composable/cartridge/scripts/payments/GiftCard/GiftCardServiceHelper.js');
const RadialHelpers = require('int_radial_composable/cartridge/scripts/helpers/RadialHelper.js')
const  recaptcha = require('app_composable/cartridge/scripts/helpers/recaptcha/recaptchaValidation.js');
const Site = require('dw/system/Site').getCurrent();

exports.getBalance = function () {

    let requestBody = request.httpParameterMap.requestBodyAsString;
    let requestJSON = JSON.parse(requestBody);

    const gcPin = requestJSON.c_giftcard_pin;
    const gcNumber = requestJSON.c_giftcard_number;
    try {
        const validationError = recaptcha.validateToken(recaptcha.TRANSACTION, recaptcha.CHECKBALANCEGC);
        if (validationError) {
            return {
                msg: "billing.giftcert.error.recaptchavalidation",
                status: "ERROR"
            };
        }
        let balance;
        if(Site.getCustomPreferenceValue('EnableAurusGCPreAuth')){
            const AurusHelper = require('int_aurus_composable/cartridge/scripts/helpers/Aurus.js');
            balance = AurusHelper.checkGiftCardBalance(gcNumber,gcPin);
        }else{
            const gcType = RadialHelpers.getCCType(gcNumber,'StoredValue',false);
            balance = GiftCardService.getBalance_v2(gcNumber, gcPin, gcType);
        }
        
        let availableMoney = new dw.value.Money(new Number(balance), 'USD');

        if (availableMoney.value == 0) {
            return {
                msg: "billing.giftcert.error.zerovalue",
                balance: availableMoney.value
            };
        } else if (availableMoney.value < 0) { // will have a value of -1 if ResponseCode = Fail, case of wrong PIN
            return {
                msg: "billing.giftcertvalidpin",
                balance: availableMoney.value
            };
        }
        return {
            balance: availableMoney.toFormattedString()
        }
    } catch (error) {
        return {
            msg: "billing.giftcertvalidpin",
            error: error.message
        };
    }
};

