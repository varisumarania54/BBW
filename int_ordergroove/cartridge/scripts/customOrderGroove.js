'use strict';
var Money = require('dw/value/Money');
var ISML = require('dw/template/ISML');
var Logger = require('dw/system/Logger');
var log = Logger.getLogger('ordergroove', 'OG');
var Site = require('dw/system/Site');

exports.OrdergrooveHelper = {
    handlePaymentInstrument: function (basket, headXML, customer) {
        var currency = headXML.child('orderCurrency').toString(),
            amount = new Money(basket.totalGrossPrice.getValue(), currency),
            foundMatchingSubCC = false;
        var paymentInstumentPutOnBasket = false;
        for each(var pi in customer.profile.wallet.getPaymentInstruments()) {
            if (pi.custom.DefaultCard) {
                var selectedPaymentInstrument = pi;
                if (empty(selectedPaymentInstrument.paymentMethod)) {
                    let noneWalletPaymentInstrument = basket.createPaymentInstrument('CREDIT_CARD', amount);
                    noneWalletPaymentInstrument.setCreditCardType(selectedPaymentInstrument.creditCardType);
                    noneWalletPaymentInstrument.setCreditCardExpirationMonth(selectedPaymentInstrument.creditCardExpirationMonth);
                    noneWalletPaymentInstrument.setCreditCardExpirationYear(selectedPaymentInstrument.creditCardExpirationYear);
                    noneWalletPaymentInstrument.setCreditCardHolder(selectedPaymentInstrument.creditCardHolder);
                    noneWalletPaymentInstrument.setCreditCardToken(selectedPaymentInstrument.creditCardToken);
                    paymentInstumentPutOnBasket = true;
                }
                foundMatchingSubCC = true;
                break;
            }
        }

        if (!foundMatchingSubCC) {
            // no subscription credit card match with customer credit cards
            log.error("Did not find matching subscription credit card with customer profile credit cards. Please set subscription card");
            ISML.renderTemplate('ErrorXML', {
                ErrorCode: '170',
                ErrorMsg: 'No default card on file for customer.'
            });
            return;
        }
        if (!paymentInstumentPutOnBasket) {
            basket.createPaymentInstrumentFromWallet(selectedPaymentInstrument, amount);
        }
    },

    inventoryAvailabilityCheck: function (basket) {
        for each(var item in basket.productLineItems) {
            var qty = item.quantity.value,
                ATS = item.product.getAvailabilityModel().getInventoryRecord().getATS().value;

            if (qty > ATS) {
                return false;
            }

            return true;
        }
    },

    shippingPromotion: function (basket, shippingCost, autoRefreshTotalAmount) {
        var isARShippingPromo = false;
        var autoRefreshShippingFreeMinAmount = ('OrderGrooveShippingFreeMinAmount' in Site.current.preferences.custom) ? parseFloat(Site.current.preferences.custom.OrderGrooveShippingFreeMinAmount) : 30;
        if (autoRefreshTotalAmount >= autoRefreshShippingFreeMinAmount) {
            isARShippingPromo = true;
            for each(var shipment in basket.shipments) {
                if ('shippingMethodID' in shipment && shipment.shippingMethodID != 'ISPU') {
                    for each(var lineItem in shipment.getAllLineItems()) {
                        if (lineItem instanceof dw.order.ShippingLineItem) {
                            var adjustments = lineItem.getShippingPriceAdjustments(); // adjustments already attached
                            var promoAlreadyApplied = false;
                            if (adjustments.size() > 0) { // adjustments applied on lineitem exists
                                for each(var adj in adjustments) {
                                    if (adj.promotionID.indexOf('OG-Promo-Shipping') > -1) {
                                        promoAlreadyApplied = true;
                                    } else {
                                        lineItem.removeShippingPriceAdjustment(adj); // remove other shipping price adjustments
                                    }
                                }
                            }
                            if (!promoAlreadyApplied) {
                                var discount = shippingCost;
                                var priceAdjustment = lineItem.createShippingPriceAdjustment("OG-Promo-Shipping-" + lineItem.getUUID(), new dw.campaign.AmountDiscount(discount));
                                priceAdjustment.setLineItemText('OG Shipping Promotion');
                            }
                        }
                    }
                }
            }
        }

        return isARShippingPromo;
    },

    createBillingAddress: function (basket, customerXML, customer) {

        var billingAddress = basket.createBillingAddress();
        billingAddress.setCompanyName(customerXML.customerBillingCompany.toString());
        billingAddress.setFirstName(customerXML.customerBillingFirstName.toString());
        billingAddress.setLastName(customerXML.customerBillingLastName.toString());
        billingAddress.setAddress1(customerXML.customerBillingAddress1.toString());
        billingAddress.setAddress2(customerXML.customerBillingAddress2.toString());
        billingAddress.setCity(customerXML.customerBillingCity.toString());
        billingAddress.setPostalCode(customerXML.customerBillingZip.toString());
        billingAddress.setStateCode(customerXML.customerBillingState.toString());
        billingAddress.setCountryCode(customerXML.customerBillingCountry.toString().toUpperCase());
        billingAddress.setPhone(customerXML.customerBillingPhone.toString());

        for each(var pi in customer.profile.wallet.getPaymentInstruments()) {
            if (pi.custom.DefaultCard && !empty(pi.custom.BillingAddressID)) {
                var defaultBillingAddress = customer.getProfile().getAddressBook().getAddress(pi.custom.BillingAddressID);

                //setting billing address (ba) info
                if (!empty(defaultBillingAddress)) {
                    var ba_firstName, ba_lastName, ba_address1, ba_address2, ba_city, ba_postal, ba_state, ba_country, ba_phone;
                    ba_firstName = customer.profile.firstName.toString();
                    ba_lastName = customer.profile.lastName.toString();

                    ba_address1 = (defaultBillingAddress.address1 ? defaultBillingAddress.address1.toString() : '');
                    ba_address2 = (defaultBillingAddress.address2 ? defaultBillingAddress.address2.toString() : '');
                    ba_city = (defaultBillingAddress.city ? defaultBillingAddress.city.toString() : '');
                    ba_postal = (defaultBillingAddress.postalCode ? defaultBillingAddress.postalCode.toString() : '');
                    ba_state = (defaultBillingAddress.stateCode ? defaultBillingAddress.stateCode.toString() : '');
                    ba_country = (defaultBillingAddress.countryCode ? defaultBillingAddress.countryCode.value.toString() : '');
                    ba_phone = (defaultBillingAddress.phone ? defaultBillingAddress.phone.toString() : '');

                    if (ba_firstName != "" && ba_lastName != "" && ba_address1 != "" && ba_city != "" && ba_postal != "" && ba_state != "", ba_country != "") {
                        var billingAddress = basket.createBillingAddress();
                        // copy the address details
                        billingAddress.setFirstName(ba_firstName);
                        billingAddress.setLastName(ba_lastName);
                        billingAddress.setAddress1(ba_address1);
                        billingAddress.setAddress2(ba_address2);
                        billingAddress.setCity(ba_city);
                        billingAddress.setPostalCode(ba_postal);
                        billingAddress.setStateCode(ba_state);
                        billingAddress.setCountryCode(ba_country);
                        billingAddress.setPhone(ba_phone);
                    }
                }
                break;
            }
        }
    },

    isArSubscriptionItem: function (order) {
        var allpli = order.getProductLineItems();
        var isArSubscriptionItem = false;
        for each(var pli in allpli) {
            if (!empty(pli.custom) && 'isAutoRefreshSubscribedItem' in pli.custom && pli.custom.isAutoRefreshSubscribedItem) {
                isArSubscriptionItem = true;
                break;
            }
        }
        return isArSubscriptionItem;
    }
}
