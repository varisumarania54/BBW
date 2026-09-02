'use strict';
const applepayService = require('app_composable/cartridge/scripts/services/applePay.js')

exports.applepayVerification = function(data){
    var resp = applepayService.paymentSession.call(data)
    if(resp.ok){
       return resp.object
    }
    else{
        throw new Error(resp.errorMessage);
    }
}
exports.applepayVerification.public = true;
