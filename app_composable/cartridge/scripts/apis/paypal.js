'use strict'

const paypalHelper = require("app_composable/cartridge/scripts/helpers/ExpressPay/paypal.js");

function processPaypal(data) {
    switch (data.action) {
        case "GET":
            return paypalHelper.getExpress(data.page_context, data.buttonId);
        case "SET":
            return paypalHelper.setExpress(data.page_context, data.buttonId);
        default:
        //Do nothing should never get here
    }

}



module.exports = {
    processPaypal
}
