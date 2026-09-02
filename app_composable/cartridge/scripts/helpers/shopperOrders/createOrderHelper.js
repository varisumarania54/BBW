'use strict';

/**
 * @namespace CreateOrder
 */
const PaymentMgr = require('dw/order/PaymentMgr');
const paymentInstrumentHelper = require('app_composable/cartridge/scripts/helpers/objects/paymentInstrument.js');
const AllocationHelper = require('int_radial_composable/cartridge/scripts/rom/inventory/allocateInventoryHelper.js');
const basketResponseHelper = require('app_composable/cartridge/scripts/helpers/objects/basketResponse.js');
const getBasketHelper = require('app_composable/cartridge/scripts/helpers/shopperBaskets/getBasketHelper.js');
const createOrderHelper = require('int_radial_composable/cartridge/scripts/rom/order/createOrderHelper.js');
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler.logger;
const creditAuth = require('int_radial_composable/cartridge/scripts/payments/creditcard/creditCardServiceHelper.js');
const Resource = require("dw/web/Resource");
const ShipmentHelper = require("app_composable/cartridge/scripts/helpers/objects/shipment.js");
const Site = require('dw/system/Site').getCurrent();
const CustomObjectMgr = require("dw/object/CustomObjectMgr");
const BasketHelper = require('app_composable/cartridge/scripts/helpers/objects/basket.js');
const ProductInventoryMgr = require('dw/catalog/ProductInventoryMgr');
const CacheMgr = require('dw/system/CacheMgr');
const ExternalInventory = require('app_composable/cartridge/scripts/helpers/integrations/inventory/ExternalInventory.js');


/**
 * Attempts to reserve the baskets requested inventroy with radial | Throws error if allocation fails
 * @function reserveInventory
 * @memberof CreateOrder
 * @param {dw.order.Order} order - The sfcc order object
 */
function reserveInventory(order) {
    try {
        //Check MAO reservation is enable
        if(Site.getCustomPreferenceValue('EnableMAOInventoryReservation')){
            const maoHelper = require('int_mao_composable/cartridge/scripts/maoHelper.js');
            if((!BasketHelper.hasOnlyEGCs(order))){
                maoHelper.allocateInventory(order);
            }
        }else {
            AllocationHelper.AllocateOrder(order);
        }
    } catch (e) {
        logHandler.failOrderAddLogInformation(order, 'INVENTORY_ALLOCATION_LOW');
        const allocationData = JSON.parse(order.custom.allocationData);
        const errorCount = allocationData.errorItems.length;
        const banner = Resource.msgf('items.unavailableCount', 'cart', null, errorCount, errorCount > 1 ? 'are' : 'is');
        const orderPLIs = order.getProductLineItems().toArray();
        //GetInventory
        const plis = orderPLIs.filter(function (li) { return allocationData.errorItems.some(function (item) { return item.id === li.UUID; }); });
        const productIds = plis.map(function (pli) { return pli.productID; });
        const storeID = order.custom.preferredStore || null;
        const inventoryMap = ExternalInventory.getInventoryForProductNOServiceCall(productIds, storeID);

        allocationData.errorItems.forEach(function (item) {
            const pli = plis.find(function (li) { return li.UUID === item.id; });
            const inv = pli ? inventoryMap[pli.productID] : null;
            if (item.fullfillmentType === 'storeInventory') {
                // BOPIS item OOS — only suggest "switch to shipping" if product has web availability
                item.c_lineLevelError = (inv && inv.webInv > 0)
                    ? Resource.msg('item.outofstock.pickup.nostore', 'cart', null)
                    : Resource.msg('item.outofstock.online_pickup', 'cart', null);
            } else {
                // STH item OOS — only suggest "switch to pickup" if product has BOPIS availability
                item.c_lineLevelError = (inv && inv.bopisInv > 0)
                    ? Resource.msg('item.outofstock.online', 'cart', null)
                    : Resource.msg('item.outofstock.online_pickup', 'cart', null);
            }
        });
        const responseMessage =
        {
            page: "cart",
            data: {
                banner: banner,
                allocationData: allocationData
            }
        }
        throw new Error(JSON.stringify(responseMessage))
    }
}

/**
 * Attempts to Authorize the payments on the basket | Throws error if payment auth fails
 * @function handlePaymentAuth
 * @memberof CreateOrder
 * @param {dw.order.LineItemCtnr} lineItemCtnr - The sfcc line item container  object
 * @param {String} orderNo - the order number
 * Throws error if payment auth fails
 */
function handlePaymentAuth(lineItemCtnr, orderNo) {
    const paymentInstruments = lineItemCtnr.getPaymentInstruments().toArray().sort((a, b) => (PaymentMgr.getPaymentMethod(a.paymentMethod).paymentProcessor.getID() == 'RADIAL_GIFT_CERTIFICATE'));
    paymentInstruments.forEach(pi => {
        let paymentMethod = PaymentMgr.getPaymentMethod(pi.paymentMethod);
        if (empty(paymentMethod)) {
            throw new Error(Resource.msg('invalidcreditcardJSON', 'billing', null));
        }
        if (paymentMethod.paymentProcessor == null) {
            switch (paymentMethod.getID()) {
                case 'DW_APPLE_PAY':
                    paymentInstrumentHelper.authApplePay(pi, lineItemCtnr, orderNo)
                    break;
                case 'SECURE_PAYMENT':
                case 'CREDIT_CARD':
                    let result = creditAuth.creditCardAuthorize(lineItemCtnr, pi, null, orderNo);
                    if (result.responseCode == "AVS") {
                        throw new Error(Resource.msg('cardnotproccessed', 'billing', null));
                    }
                    else if (!result.success) {
                        throw new Error(Resource.msg('invalidcreditcardJSON', 'billing', null));
                    }
                    break;
                case 'Venmo':
                case 'PayPal':
                    paymentInstrumentHelper.paypalAuth(lineItemCtnr, orderNo);
                    BasketHelper.updateBasketState(lineItemCtnr);
                    break;
                case 'GIFT_CERTIFICATE':
                    paymentInstrumentHelper.redeemGC(lineItemCtnr, pi, paymentMethod.paymentProcessor, orderNo);
                    break;
                default:
                    throw new Error(Resource.msg('invalidcreditcardJSON', 'billing', null));
                    break;
            }
        }
        else {
            switch (paymentMethod.paymentProcessor.getID()) {
                case 'DW_APPLE_PAY':
                case 'RADIAL_APPLE_PAY':
                    paymentInstrumentHelper.authApplePay(pi, lineItemCtnr, orderNo)
                    break;
                case 'PAYPAL':
                case 'RADIAL_PAYPAL':
                    paymentInstrumentHelper.paypalAuth(lineItemCtnr, orderNo);
                    BasketHelper.updateBasketState(lineItemCtnr);
                    break;
                case 'RADIAL_GIFT_CERTIFICATE':
                    paymentInstrumentHelper.redeemGC(lineItemCtnr, pi, paymentMethod.paymentProcessor, orderNo);
                    break;
                case 'RADIAL_CREDIT':
                    let result = creditAuth.creditCardAuthorize(lineItemCtnr, pi, null, orderNo);
                    if (!result.success) {
                        throw new Error(Resource.msg('invalidcreditcardJSON', 'billing', null));
                    }
                    break;
                default:
                    throw new Error(Resource.msg('invalidcreditcardJSON', 'billing', null));
                    break;
            }
        }
    });
}

/**
 * increments the bopis order limit for a store IF the order has bopis
 * @function handleBopisOrderLimits
 * @memberof CreateOrder
 * @param {dw.order.Order} order - The sfcc order object
 */
function handleBopisOrderLimits(order) {
    try {
        if (dw.system.Site.getCurrent().getCustomPreferenceValue('BopisOrderLimits')) {
            incrementBopisOrder(order);
        }
        // If the bopis store has reached it's limit clear bopis cookies and session variables
        // Clear bopis cookies
        // Clear bopis session variables
    } catch (e) {
        dw.system.Logger.error('incrementBopisOrderLimits.js: ' + e);
    }
}

/**
 * Attempts to export the sfcc order to radial. If failure then mark order as such.
 * @function exportOrder
 * @memberof CreateOrder
 * @param {dw.order.Order} order - The sfcc order object
 */
function exportOrder(order) {
    try {
        createOrderHelper.createOrderROM(order);
    } catch (e) {
        order.setExportStatus(dw.order.Order.EXPORT_STATUS_FAILED);
        logHandler.error(e, 'ROMS', 'EXPORT')
    }
}

/**
 * Checks if all payment instruments on the basket are of valid types.
 * @function paymentValid
 * @memberof CreateOrder
 * @param {basket} basket - The sfcc basket object
 */
function paymentValid(basket) {
    const PaymentMgr = require('dw/order/PaymentMgr');
    let countryCode = basket.getBillingAddress().getCountryCode().value;
    let nonGCAmount = calculateNonGiftCertificateAmount(basket).value;
    let methods = PaymentMgr.getApplicablePaymentMethods(customer, countryCode, nonGCAmount);
    let ccMethod = PaymentMgr.getPaymentMethod(dw.order.PaymentInstrument.METHOD_CREDIT_CARD);
    let cards = ccMethod != null ? ccMethod.getApplicablePaymentCards(customer, countryCode, nonGCAmount) : dw.util.List.EMPTY_LIST;
    let isAutoRefreshSubscribedItem = basket.productLineItems.toArray().some(function (product) {
        return Object.hasOwnProperty.call(product.custom, 'isAutoRefreshSubscribedItem') && product.custom.isAutoRefreshSubscribedItem;
    });
    let hasDefaultCard = false;
    if (!empty(customer) && customer.isAuthenticated() && customer.profile && !empty(customer.profile.getWallet())) {
        hasDefaultCard = customer.profile.getWallet().getPaymentInstruments().toArray().some(e => !empty(e.custom.DefaultCard) && e.custom.DefaultCard);
    }

    let invalidMethods = basket.getPaymentInstruments().toArray().filter(pi => {
        if (dw.order.PaymentInstrument.METHOD_GIFT_CERTIFICATE.equals(pi.paymentMethod))
            return false;

        let paymentMethod = PaymentMgr.getPaymentMethod(pi.getPaymentMethod())
        if (empty(paymentMethod) || !methods.toArray().some(e => e.UUID === paymentMethod.UUID))
            return true;

        if (dw.order.PaymentInstrument.METHOD_CREDIT_CARD.equals(pi.paymentMethod)) {
            let cardType = PaymentMgr.getPaymentCard(pi.creditCardType);
            if (empty(cardType) || !cards.toArray().some(e => e.UUID === cardType.UUID))
                return true;
        }

        if (isAutoRefreshSubscribedItem &&
            (!(Object.hasOwnProperty.call(pi.custom, 'saveCard') || pi.custom.saveCard) || !hasDefaultCard) &&
            (empty(customer) || !customer.isAuthenticated())) {
            return true;
        }

    });

    return empty(invalidMethods);
}


/**
 * Checks if payment instrument amounts add up to the total on the basket.
 * @function paymentInstrumentTotalValid
 * @memberof CreateOrder
 * @param {dw.order.Basket} basket - The sfcc basket object
 */
function paymentInstrumentTotalValid(basket) {
    let instrumentTotal = basket.getPaymentInstruments().toArray().reduce((a, b) => {
        return !empty(b.paymentTransaction) ? a.add(b.paymentTransaction.amount) : a
    }, new dw.value.Money(0, basket.currencyCode));
    return basket.getTotalGrossPrice().equals(instrumentTotal)
}

/**
 * Calculates the total amount that will be covered by SFCC GLCI's
 * PSA WE DON'T USE true GCLIs so this might be uneccesary but it does run in legacy
 * @function paymentValid
 * @memberof CreateOrder
 * @param {basket} The sfcc basket object
 */
function calculateNonGiftCertificateAmount(basket) {
    let gcPaymentInstrs = basket.getGiftCertificatePaymentInstruments();
    let giftCertTotal = gcPaymentInstrs.toArray().reduce((a, b) => { return a.add(b.getPaymentTransaction().getAmount()) }, new dw.value.Money(0.0, basket.currencyCode));
    return basket.totalGrossPrice.subtract(giftCertTotal);
}

/**
 * Retrieves the credit card payment instrument from an order.
 * @function getCCPaymentInstrument
 * @memberof CreateOrder
 * @param {dw.order.Order} order - The order object containing payment instruments.
 * @returns {dw.order.PaymentInstrument|null} - The credit card payment instrument, or null if not found.
 */
function getCCPaymentInstrument(order) {
    const paymentInstruments = order.getPaymentInstruments(dw.order.PaymentInstrument.METHOD_CREDIT_CARD);
    return !empty(paymentInstruments) ? paymentInstruments[0] : null;
}

/**
 * Handles what logic to run for the order response
 * @function handleModify
 * @memberof CreateOrder
 * basket {dw.order.order} the current order object
 * response {response}
 */
function handleModify(order, response) {
    const OrderIdPrefix = !empty(Site.getCustomPreferenceValue('BBWOrderNumberPrefix')) ? Site.getCustomPreferenceValue('BBWOrderNumberPrefix') : '';
    basketResponseHelper.buildFakeProductLineItemsByDiscount(response, order);
    basketResponseHelper.handleCustomSubTotal(response, order)
    basketResponseHelper.attachPromoInfoToCouponItems(response, order);
    getBasketHelper.modifyResponseNoContext(response, order);
    response.c_emailHash = order.custom.emailHash;
    response.orderNo = OrderIdPrefix ? OrderIdPrefix + response.orderNo : response.orderNo;
}

/**
 * Handles adding the radial order context info to the order
 * @function handleOrderContext
 * @memberof CreateOrder
 * @param {dw.order.Order} order the current order object
 */
function handleOrderContext(order, requestBody) {
    let requiredCookie = '';
    if (!empty(request.getHttpCookies())) {
        for (var i in request.getHttpCookies()) {
            let cookie = request.getHttpCookies()[i];
            if (cookie.name == 'user_token') {
                requiredCookie = cookie.value;
                break;
            }
        }
    }
    const orderContext = {
        HostName: request.httpHost,
        SessionId: session.sessionID,
        UserAgent: (request.httpHeaders.get('c_fastly-user-agent')) || (requestBody.c_userAgent),
        IPAddress: (request.httpHeaders.get('c_fastly-client-ip')) || (request.httpRemoteAddress),
        Connection: requestBody.c_connection,
        Referrer: requestBody.c_referrer,
        ContentTypes: requestBody.c_contentTypes,
        Encoding: requestBody.c_encoding,
        Language: requestBody.c_language,
        Cookies: requiredCookie
    }
    order.custom.RadialOrderContext = JSON.stringify(orderContext);
}


/**
 * Saves a payment instrument to the customer's wallet.
 * This function is called after a successful payment transaction.
 * @param {dw.order.LineItemCtnr} order - The order object
 * @param {dw.customer.Customer} customer - The customer object
 * @return {boolean} Returns true if the card was successfully saved to the customer's wallet, otherwise false.
 */
function saveCardToCustomerWallet(order, customer) {
    // Retrieve the customer's wallet
    let wallet = customer.getProfile().getWallet();

    // Ensure there are payment instruments in the order
    if (order.getPaymentInstruments().toArray().length === 0) {
        return false;
    }

    // Get the credit card payment instrument from the order
    let orderCardPaymentInstrument = getCCPaymentInstrument(order);

    // Exit if no credit card payment instrument is found
    if (empty(orderCardPaymentInstrument)) {
        return false;
    }

    // get existing payment methods
    const piList = wallet.getPaymentInstruments().toArray();

    // Check if a duplicate card already exists in the wallet based on card details such as
    // last digits of the card number, card type, expiration month, and expiration year.
    // If a duplicate is found, the function returns false, and the card is not added to the wallet.
    if (piList.some(pi => pi.creditCardNumberLastDigits === orderCardPaymentInstrument.creditCardNumberLastDigits &&
        pi.creditCardType === orderCardPaymentInstrument.creditCardType &&
        pi.creditCardExpirationMonth === orderCardPaymentInstrument.creditCardExpirationMonth &&
        pi.creditCardExpirationYear === orderCardPaymentInstrument.creditCardExpirationYear)
    ) {
        return false;
    }

    // Create a stored payment instrument in the wallet with the given payment method ID
    let storedPaymentInstrument = wallet.createPaymentInstrument(orderCardPaymentInstrument.getPaymentMethod());

    // Set credit card details for the stored payment instrument
    storedPaymentInstrument.setCreditCardHolder(orderCardPaymentInstrument.getCreditCardHolder());
    storedPaymentInstrument.setCreditCardNumber(orderCardPaymentInstrument.getCreditCardNumber());
    storedPaymentInstrument.setCreditCardType(orderCardPaymentInstrument.getCreditCardType());
    storedPaymentInstrument.setCreditCardExpirationMonth(orderCardPaymentInstrument.getCreditCardExpirationMonth());
    storedPaymentInstrument.setCreditCardExpirationYear(orderCardPaymentInstrument.getCreditCardExpirationYear());
    // Set credit card token for the stored payment instrument
    storedPaymentInstrument.setCreditCardToken(orderCardPaymentInstrument.getCreditCardToken());
    // Only set default if the piList is zero / is first card added to wallet
    storedPaymentInstrument.custom.DefaultCard = piList.length == 0;

    return true;
}

/**
 * Handles the shipping address on egc only baskets
 * @param {dw.order.Basket} basket - The order object
 */
function handleEGCOnlyShipments(basket) {
    basket.getShipments().toArray().forEach(shipment => {
        if (ShipmentHelper.hasOnlyEGCs(shipment)) {
            let address = shipment.createShippingAddress();
            address.setCountryCode(Site.getCustomPreferenceValue('RadialShippingFromCountry') || 'US');
            address.firstName = ' ';
            address.lastName = ' ';
            address.phone = ' ';
            address.postalCode = ' ';
            address.stateCode = ' ';
            address.city = ' ';
            address.address1 = ' ';
            address.address2 = ' ';
        }
    });
}

/**
 * Returns Boolean if the BOPIS Store custom object has reached it's limit.
 * This method keeps a increment record of OrderQty in the BopisStores custom object
 *
 * @param {Object} Order : dw.order.Order.
 * @return {boolean} true/false : Tells the pipeline script node that invokes it to remove BOPIS cookies/Session variables if the limit has been reached.
 */
function incrementBopisOrder(Order) {
    if ('shipments' in Order && !empty(Order.shipments)) {

        // Get store id from Order shipments
        const bopisShipment = Order.shipments.toArray().find(shipment => 'shipmentType' in shipment.custom
            && shipment.custom.shipmentType == 'instore'
            && 'fromStoreId' in shipment.custom
            && !empty(shipment.custom.fromStoreId)
            && 'productLineItems' in shipment
            && 'empty' in shipment.productLineItems
            && !shipment.productLineItems.empty);
        const bopisShipmentStoreId = !empty(bopisShipment) ? bopisShipment.custom.fromStoreId : null;
        if (!empty(bopisShipmentStoreId)) {

            // Retrieve custom object, if it exists, that matches the store id
            const bopisStoreCustomObj = CustomObjectMgr.getCustomObject('BopisStores', bopisShipmentStoreId); // returns Boolean
            if (!empty(bopisStoreCustomObj)) {

                // Defer Order Count: Records bopis sales for stores in a seperate place which is processed in intervals by a job
                const DeferOrderCount = Site.getCustomPreferenceValue('DeferOrderCount');

                if (!empty(DeferOrderCount) && DeferOrderCount) {
                    // Write order id to custom object for storage
                    const bopisOrderCustomObj = CustomObjectMgr.createCustomObject('BopisOrders', Order.orderNo);
                    bopisOrderCustomObj.custom.storeId = bopisShipmentStoreId;
                } else {
                    // Increment custom object OrderQuantity
                    const currentOrderQty = bopisStoreCustomObj.custom.OrderQty;
                    bopisStoreCustomObj.custom.OrderQty = currentOrderQty + 1;

                    // If bopisLimitReached is false and OrderQty is greater or equal to OrderLimit only then set the flag to true
                    if ('bopisLimitReached' in bopisStoreCustomObj.custom && bopisStoreCustomObj.custom.bopisLimitReached == false
                        && parseInt(bopisStoreCustomObj.custom.OrderQty) >= parseInt(bopisStoreCustomObj.custom.OrderLimit)) {
                        bopisStoreCustomObj.custom.bopisLimitReached = true;

                        // Apply store to the performance Bopis Order Limits Custom Object
                        if (Site.getCustomPreferenceValue('BopisOrderLimitsPerformanceMode')) {
                            let disabledStores = CustomObjectMgr.getCustomObject('BopisOrderLimitsDisabledStoreList', 'BBW');
                            if (!empty(disabledStores)) {
                                let disabledStoreIDs = disabledStores.custom.storeIDsCSV;
                                if (disabledStoreIDs && !disabledStoreIDs.includes(bopisShipmentStoreId)) {
                                    disabledStoreIDs = empty(disabledStores.custom.storeIDsCSV)? bopisShipmentStoreId : disabledStoreIDs + "," + bopisShipmentStoreId;
                                }
                            }
                        }
                    }
                }

                // If all conidtions are met we will remove the BopisStore cookies and removed preferred stores from session
                if ('bopisLimitReached' in bopisStoreCustomObj.custom && bopisStoreCustomObj.custom.bopisLimitReached == true) {
                    return true;
                }
            }
        }
    }

    // In scenarios where we are using Order Limits return false so we do not clear Bopis cookie and session identifiers
    return false;
}

/**
 * Swaps the inventory list for all product line items in the basket.
 * @function swapInvLists
 * @memberof CreateOrder
 * @param {Object} invList - The inventory list to be set for the product line items.
 * @param {Object} basket - The basket containing the product line items.
 */

function swapInvLists(invList, basket, categoryIds) {
    const listIDs = Site.getCustomPreferenceValue('perpetualInvListIds').split(',');
    const includeNullListId = listIDs.includes(ProductInventoryMgr.getInventoryList().ID);
    const categoryIdsArray = categoryIds.split(',');
    basket.getProductLineItems().toArray().forEach(pli => {
        /// Might need to check all cats pli.product.categories
        if (!empty(pli.product.categories) &&
            listIDs.some(e => e === pli.productInventoryListID || (pli.productInventoryListID == null && includeNullListId))
            && pli.product.getCategories().toArray().some(e => categoryIdsArray.includes(e.ID))) {
            pli.custom.originalInvId = pli.productInventoryListID;
            pli.setProductInventoryList(invList);
            pli.setProductInventoryListID(invList.ID)
            request.custom.swappedInv = true;
        }
    });
    if (request.custom.swappedInv) {
        BasketHelper.updateBasketState(basket);
    }
}

module.exports = {
    reserveInventory,
    handlePaymentAuth,
    handleBopisOrderLimits,
    exportOrder,
    paymentValid,
    getCCPaymentInstrument,
    saveCardToCustomerWallet,
    handleModify,
    handleOrderContext,
    handleEGCOnlyShipments,
    paymentInstrumentTotalValid,
    swapInvLists
}
