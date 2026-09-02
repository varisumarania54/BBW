'use strict'

const getBasketHelper = require('app_composable/cartridge/scripts/helpers/shopperBaskets/getBasketHelper.js');
const validationsUtil = require('app_composable/cartridge/scripts/helpers/util/validationsUtil');
const errorHandler = require('app_composable/cartridge/scripts/helpers/util/errorHandler.js').errorHandler;


exports.beforePATCH = function (basket, giftCertificateItemId, item) {

    validationsUtil.validateRequestBody('Basket-Attributes');

    const Site = require('dw/system/Site');
    var errorList = [];
    if (item == null) {
        return new dw.system.Status(dw.system.Status.ERROR, "400", errorHandler.getErrorMessage('EDITGIFTCARD-04-001'))
    }

    // Validate amount in range
    if (item.amount < 5 || item.amount > 5000) {
        errorList.push({ "amountError": "giftcert.amountvalueerror" })
    }

    /**
     * TODO: tech debt ticket opened to rework badword logic
     * current day entire string has to be enterd into message field
     * for this to work
	 */
    if (!empty(item.message)) {
        var badWords = Site.current.getCustomPreferenceValue('giftCardBadLanguage');
        for each(var word in badWords) {
            var regexp = new RegExp(word, 'ig');
            if (item.message.match(regexp)) {
                errorList.push({ "messageError": "giftcert.message.badwords" })
                break;
            }
        }
    }
    if (errorList.length > 0) {
        return new dw.system.Status(dw.system.Status.ERROR, "400", JSON.stringify(errorList))
    }
}

exports.modifyPATCHResponse = function(basket,basketResponse){
        getBasketHelper.handleModify(basketResponse,basket);
}


