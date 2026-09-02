const basketHelper = require('app_composable/cartridge/scripts/helpers/objects/basket.js');
const BopisHelper = require('app_composable/cartridge/scripts/helpers/objects/BasketComponents/BopisHelper.js');
const CCHelper = require('app_composable/cartridge/scripts/helpers/global/CustomerCare.js');
const taxService = require('int_radial_composable/cartridge/scripts/rom/tax/taxServiceHelper.js');
const shopperContextHelper = require('app_composable/cartridge/scripts/helpers/adobe/shopperContextHelper.js');
const Site = require('dw/system/Site').getCurrent();

/**
 * Handles basket transactions based on the request body.
 * @returns {Object} The basket response object.
 */
exports.basketTransaction = function (requestBody) {
    const basket = dw.order.BasketMgr.getCurrentBasket();
    const enableShoppingBagRedesign = shopperContextHelper.isFeatureEnabled('shopping-bag-redesign', 'enableShoppingBagRedesign');
    if (!empty(basket)) {
        basket.custom.updatePreferredStore = false;
        switch (requestBody.c_pageID) {
            case 'cart-changeStoreModal':
                basket.custom.updatePreferredStore = BopisHelper.handlePreferredStore('changeStoreModal', requestBody.c_storeID);
            //Need to run cart after cart-changeStoreModal
            case 'cart':
                if (Site.getCustomPreferenceValue('clearStateOnCartLoad')) {
                    basket.custom.cartStateString = '';
                }
                BopisHelper.handlePreferredStore('updateCartBopisLocationPli', basket.custom.preferredStore);
                basketHelper.clearTaxData(basket);
                basketHelper.cleanUpProductLevelMessaging(basket);
                basket.removeAllPaymentInstruments();
                !enableShoppingBagRedesign ? basketHelper.switchFullfilmentBasedOnAvailability(basket) : null;
                basketHelper.setInventoryOnPLIs(basket);
                basketHelper.clearGiftMessaging(basket);
                basketHelper.updatePLIBOPISData(basket);
                CCHelper.HandleAgent(basket, requestBody.c_token, requestBody.c_usid, request.SCAPIPathParameters.get('organizationId'));
                break;
            case 'review':
                taxService.calculateRealTaxesOnBasket(basket, basket.custom.PrevTaxCallStatus != 'radial');
                basketHelper.updatePLIBOPISData(basket);
                request.custom.skipTax = true;
                break;
            case 'changeStoreModal':
                basket.custom.updatePreferredStore = BopisHelper.handlePreferredStore('changeStoreModal', requestBody.c_storeID);
                !enableShoppingBagRedesign ? basketHelper.switchFullfilmentBasedOnAvailability(basket) : null;
                break;
            default:
                break;
        }

        dw.system.HookMgr.callHook('dw.order.calculate', 'calculate', basket);
    }
    return dw.system.RESTResponseMgr.createScapiRemoteInclude("customer", "shopper-customers", "v1", "customers/" + customer.ID + "/baskets", dw.web.URLParameter("siteId", dw.system.Site.getCurrent().getID()));
};
