'use strict';

/**
 * Ordergroove Checkout Settings
 *
 * @module getSettings
 *
 * @input Customer : dw.customer.Customer
 * @output ProductSettings : String
 * @output isARSubscriber : Boolean
 *
 */

/**
 * Ordergroove settings function to help render offers
 * @returns {string} The product settings in JSON format
 */
function getOGSettings() {
    var BasketMgr = require('dw/order/BasketMgr');
    var basket = BasketMgr.getCurrentBasket();
    var settings = {};
    settings.page_type = '3';
    var cart = {};
    var products = [];
    var plis = basket.getAllProductLineItems().iterator();
    while (plis.hasNext()) {
        var lineItem = {};
        var pli = plis.next();
        lineItem.id = pli.getProductID();
        lineItem.quantity = pli.getQuantityValue();
        products.push(lineItem);
    }
    cart.products = products;
    settings.cart = cart;
    var productSettings = 'og_settings = ' + JSON.stringify(settings, null, 5);
    return productSettings;
}

/**
 * Reserved function for pipeline compatibility
 * @param {Object} pdict - the pipeline dictionary
 * @returns {Object} The next pipelet
 */
function execute(pdict) {
    pdict.ProductSettings = getOGSettings(); //eslint-disable-line
    // check site preference before we decide to call the subscription helper
    if (pdict.Customer.isAuthenticated() && ('OrderGrooveEnable' in dw.system.Site.current.preferences.custom && dw.system.Site.current.preferences.custom.OrderGrooveEnable)) {
        var subscriptionHelper = require('int_ordergroove/cartridge/scripts/customerSubscriptionFlag.js');
        pdict.isARSubscriber = subscriptionHelper.subscriberHelper(customer);
    }
    return PIPELET_NEXT; //eslint-disable-line
}

/* Module export for controllers */
module.exports = {
    getSettings: getOGSettings,
    execute: execute
};
