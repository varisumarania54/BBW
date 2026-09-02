const Site = require('dw/system/Site').getCurrent();
const Money = require('dw/value/Money');
const StoreMgr = require('dw/catalog/StoreMgr');
const ShippingMgr = require('dw/order/ShippingMgr');
const Resource = require('dw/web/Resource');

const xmlToJson = require('app_composable/cartridge/scripts/helpers/util/xmlToJson.js');
const flattenArray = require('app_composable/cartridge/scripts/helpers/util/es10.js').flattenArray;

/**
 * ordersModel: Parses XML into expected order history object
 * @param {String} customerNumber - Customer number for filtering wrong orders in response
 * @param {XML} orderHistoryXML - XML document containing order history
 * @returns {Object} Returns model object of Order History
 */
function orderHistoryModel(customerNumber, orderHistoryXML) {
    let orderHistory = [];
    if (orderHistoryXML.elements().length()) {
        let options = {
            parse: [
                { property: 'CustomerOrderId', valueType: 'String' },
                { property: 'CustomerId', valueType: 'String' },
                { property: 'OrderSummary', valueType: 'Array' }
            ]
        };
        let orders = xmlToJson.parseDocument(orderHistoryXML, options);

        if (Array.isArray(orders)) {
            orderHistory = orderHistory.concat(orders);
        }

        if (orders.OrderSummary) {
            orderHistory = orderHistory.concat(orders.OrderSummary);
        }
    }

    let customerOrders = orderHistory.filter(order => !empty(order.CustomerOrderId) && customerNumber === order.CustomerId);
    let BBWOrderNumberPrefix = Site.getCustomPreferenceValue('BBWOrderNumberPrefix') || '';
    let currency = Site.getDefaultCurrency();
    return customerOrders.map(order => {
        let creationDate = new Date(order.OrderDate).toISOString();
        let omsOrderNo = order.CustomerOrderId;
        let orderNo = omsOrderNo.replace(BBWOrderNumberPrefix, '');
        let total = order.OrderTotal;
        return {
            creationDate,
            currency,
            omsOrderNo,
            orderNo,
            total
        }
    });
}

/**
 * Maps available data to billing object structure otherwise provides null values
 * @function getAddress
 * @memberof orderDetailsHelper
 * @param {Object} addressObj - address object from radial
 * @return {Object} address object
 */
function getAddress(addressObj) {
    let address = addressObj.Address || {};
    let personName = addressObj.PersonName || {};
    let fullName = getFullName(personName);
    return {
        address1: address.Line1 || null,
        address2: address.Line2 || null,
        city: address.City || null,
        countryCode: address.CountryCode || null,
        firstName: personName.FirstName || null,
        fullName: fullName,
        lastName: personName.LastName || null,
        phone: addressObj.Phone || null,
        postalCode: address.PostalCode || null,
        stateCode: address.MainDivision || null
    };
}

/**
 * Maps product items data to proper structure
 * @function getProductItems
 * @memberof orderDetailsHelper
 * @param {Array} orderItems - array of order items
 * @param {String} currency - order currency string ex: 'USD'
 * @param {Object} processAttributes - custom attributes to process on each item
 * @return {Array} new array of mapped product items data
 */
function getProductItems(orderItems, currency, processAttributes, isShipping) {
    const BBWPrefixID = Site.getCustomPreferenceValue('BBWPrefixID') || '';
    return orderItems.map(item => {
        let giftBoxSKU = Site.getCustomPreferenceValue('GiftBoxSKU');
        let productId = item.ItemId.replace(BBWPrefixID.concat('-'), '')
        let quantity = item.Quantity || 0;
        let isGiftBoxSKU = productId === giftBoxSKU;
        let isEGC = item.Carrier && item.Carrier.mode === 'EMAIL';
        let product = {
            productId,
            quantity,
            c_isGiftBoxSKU: isGiftBoxSKU,
            c_isEGC: isEGC
        };
        item.CustomAttributes.forEach(attribute => {
            let key = attribute.Key;
            let attributeKeys = Object.keys(processAttributes);
            if (attributeKeys.includes(key)) {
                if ('Value' in attribute) {
                    let attrKey = 'c'.concat('_', key);
                    product[attrKey] = processAttributes[key](attribute.Value);
                }
            }
        });
        let pricing = item.Pricing || {};
        let productPricing = getProductPricing(pricing, currency, isShipping);
        Object.assign(product, productPricing);
        if (item.trackingLink) {
            product.c_trackingLink = item.trackingLink;
        }

        return product;
    });
}

/**
 * Builds tracking link if available
 * http://tracking.narvar.com/bathandbodyworks/tracking/ups?tracking_numbers=Z30006611195&order_number=0047408071542&local=en_US
 * @function getTrackingLink
 * @memberof orderDetailsHelper
 * @param {Object} item - order item w/ possible tracking link
 * @param {String} carrier - shipment carrier
 * @param {String} orderNo - order number used to create link
 * @return {String|null} tracking link
 */
function getTrackingLink(item, carrier, orderNo) {
    let trackingLink = null;
    let trackingNumber = item && item.TrackingNumbers && item.TrackingNumbers.TrackingNumber || null;
    if (carrier && trackingNumber && orderNo) {
        trackingLink = Resource.msgf('orderdetails.trackingurl', 'composable/account/orderHistory', null, carrier, trackingNumber, orderNo, request.locale);
    }
    return trackingLink;
}

/**
 * Creates product pricing by adding multiple taxes
 * @function getProductPricing
 * @memberof orderDetailsHelper
 * @param {Object} pricing - pricing object from order item
 * @param {String} currency - currency string from order
 * @return {Object} pricing object
 */
function getProductPricing(pricing, currency, isShipping) {
    let merchandise = pricing.Merchandise || {};
    let shipping = pricing.Shipping || {};
    let shippingTaxes = shipping && shipping.TaxData && shipping.TaxData.Taxes || [];
    let merchandiseTaxes = merchandise && merchandise.TaxData && merchandise.TaxData.Taxes || [];
    let taxes = isShipping ? shippingTaxes : merchandiseTaxes;
    let amount = merchandise.Amount && merchandise.Amount.value || 0;
    let productPrice = new Money(amount, currency);
    // By default pre discount price is same as product original price
    let preDiscountPrice = productPrice;
    let promotionalDiscounts = merchandise.PromotionalDiscounts || [];
    promotionalDiscounts.forEach(discount => {
        let discountAmount = discount.Amount || 0;
        productPrice = productPrice.subtract(new Money(discountAmount, currency));
    });

    let productTax = addTotalMoney(taxes, 'CalculatedTax', currency);
    return {
        price: productPrice.getValueOrNull(),
        preDiscountPrice: preDiscountPrice.getValueOrNull(),
        tax: productTax.getValueOrNull(),
        discounts: promotionalDiscounts.map(promo => ({
            amount: promo.Amount,
            description: promo.Description
        }))
    }
}

/**
 * Builds array of products shipped
 * @function getShippingItems
 * @memberof orderDetailsHelper
 * @param {Array} items - all order products
 * @param {String} currency - used for money calculations
 * @returns {Array} Returns array of products shipped
 */
function getShippingItems(items, currency) {
    let shippingItems = items.filter(item => item.FulfillmentChannel === 'SHIP_TO_HOME' && item.Carrier && item.Carrier.mode !== 'EMAIL');
    let processAttributes = {
        'EstimatedDeliveryDateFROM': (value) => new Date(value).toISOString(),
        'EstimatedDeliveryDateTO': (value) => new Date(value).toISOString()
    };

    return getProductItems(shippingItems, currency, processAttributes, true);
}

/**
 * Builds array of shipments response
 * @function getShipments
 * @memberof orderDetailsHelper
 * @param {Array} addresses - address, person name, phone numbers
 * @param {Array} shipGroups - used for mapping shipments that have no shipped
 * @param {Array} shipments - used for mapping shipments that have been shipped
 * @param {Array} items - all order products
 * @param {String} currency - used for money calculations
 * @returns {Object} Returns array of shipments response
 */
function getShipments(addresses, shipGroups, shipments, items, currency, orderNo) {
    let shippingItems = [];
    let shipmentsResponse = shipGroups.reduce((shipGroups, shipGroup) => {
        let shipGroupId = shipGroup.DestinationTarget && shipGroup.DestinationTarget.ref || null;
        let shipment = getShipment(shipments, shipGroupId);
        Object.assign(shipGroup, shipment);
        let orderItems = shipGroup.OrderItems || [];
        let itemRefs = orderItems.map(item => item.ref) || [];

        let includedItems = items.reduce((acc, item) => {
            if (itemRefs.includes(item.id)) {
                if (shipGroup.ShippedItems) {
                    let shippedItems = shipGroup.ShippedItems && Array.isArray(shipGroup.ShippedItems) ? shipGroup.ShippedItems : [shipGroup.ShippedItems.ShippedItem];
                    let shippedItem = shippedItems.find(shippedItem => {
                        return shippedItem.Item.ref === item.id;
                    });
                    Object.assign(item, shippedItem);
                    let carrier = shipment && shipment.Carrier && shipment.Carrier.value && shipment.Carrier.value.toLowerCase();
                    item.trackingLink = getTrackingLink(item, carrier, orderNo);
                }
                acc.push(item)
            }
            return acc;
        }, []);

        let item = includedItems[0];
        let carrier = item.Carrier || null;
        let shippingTotal = ('Shipping' in item.Pricing) ? item.Pricing.Shipping.Amount : null;

        if (carrier && carrier.mode === 'EMAIL') {
            return shipGroups;
        }

        let address = addresses.find(address => {
            return address.id === shipGroupId
        });

        let shipmentResponse = {
            shippingAddress: getAddress(address),
            shippingMethod: buildShippingMethod(carrier, shippingTotal)
        };

        let giftMessage = shipGroup.Gifting && shipGroup.Gifting.Packslip || null;
        if (giftMessage) {
            shipmentResponse.c_giftMessage = giftMessage;
        }

        let pickupDetails = getStorePickupDetails(item);
        if (!empty(pickupDetails)) {
            Object.assign(shipmentResponse, pickupDetails);
        }

        shippingItems = shippingItems.concat(includedItems);
        shipGroups.push(shipmentResponse);
        return shipGroups;
    }, []);
    return { shipments: shipmentsResponse, shippingItems };
}

/**
 * Given an array of shipments we find the shipment
 * with the destination reference to ship group id
 * @function getShipments
 * @memberof orderDetailsHelper
 * @param {Array} shipments - collection of shipments
 * @param {String} shipGroupId - target destination reference
 * @returns {Object} Returns matching shipment object or empty object
 */
function getShipment(shipments, shipGroupId) {
    let shipment;
    if (Array.isArray(shipments) && shipments.length) {
        shipment = shipments.find(shipment => {
            return shipment.destinationRef === shipGroupId;
        });
    }
    return shipment ? shipment : {};
}

/**
 * Builds store pickup response object if not available returns null
 * @function getStorePickupDetails
 * @memberof orderDetailsHelper
 * @param {Object} item - order item from shipment
 * @returns {Object|null} Returns store pickup response object if not available returns null
 */
function getStorePickupDetails(item) {
    let store = getStoreDetails(item);
    if (empty(store)) {
        return null;
    }
    return {
        store: store,
        proxyPickupName: getPickupName(item)
    }
}

/**
 * Builds store details response object if not available returns null
 * @function getStoreDetails
 * @memberof orderDetailsHelper
 * @param {Object} item - order item from shipment
 * @returns {Object|null} Returns store pickup response object if not available returns null
 */
function getStoreDetails(item) {
    let storeFrontDetails = item && item.StoreFrontDetails || null;
    if (empty(storeFrontDetails)) {
        return null;
    }
    let storeFrontLocation = storeFrontDetails && storeFrontDetails.StoreFrontLocation;
    let storeCode = storeFrontLocation && storeFrontLocation.StoreCode || null;
    storeCode = storeCode && storeCode.toString().padStart(5, '0').padStart(8, 'BBW');
    let store = StoreMgr.getStore(storeCode);
    if (store) {
        let storeHours = store.getStoreHours().toString();
        let todaysHours = getCurrentStoreHours(storeHours);
        return {
            address: {
                address1: store.address1 || null,
                address2: store.address2 || null,
                city: store.city || null,
                postalCode: store.postalCode || null,
                stateCode: store.stateCode || null,
            },
            name: storeFrontLocation.StoreName || null,
            id: storeCode || null,
            directions: storeFrontDetails.StoreDirections || null,
            todaysHours
        };
    }
}

/**
 * Builds pick up proxy name if the order contains those details
 * @function getPickupName
 * @memberof orderDetailsHelper
 * @param {Object} item - order item that holds ProxyPickupDetails
 * @returns {Object|null} Returns object of PersonName
 */
function getPickupName(item) {
    let proxyPickupDetails = item && item.ProxyPickupDetails || null;
    if (empty(proxyPickupDetails)) {
        return null;
    }
    return proxyPickupDetails.PersonName || null;
}

/**
 * Adds specific items properties even when nested
 * @function addTotalMoney
 * @memberof orderDetailsHelper
 * @param {Array} items - order products
 * @param {String} property - property target supports optional dot notation path ex: 'Pricing.Merchandise.Amount.value'
 * @param {String} currency - supports Money class
 * @returns {dw.value.Money} Returns Money object total for all items
 */
function addTotalMoney(items, property, currency) {
    let totalMoney = items.reduce((total, item) => {
        let itemPrice;
        if (property.includes('.')) {
            let nestedItemPrice = property.split('.').reduce((col, prop) => col && col[prop], item);
            itemPrice = new Money(nestedItemPrice, currency);
        } else if (Array.isArray(item[property])) {
            // for discounts which is an array of objects
            let sumAmount = item[property].reduce((sum, prop) => sum + (prop.amount || 0), 0);
            itemPrice = new Money(sumAmount, currency);
        } else {
            itemPrice = property in item ? new Money(item[property], currency) : new Money(0, currency);
        }
        return total.add(itemPrice);
    }, new Money(0, currency));
    return totalMoney;
}

/**
 * Build shippingMethod response object
 * @function buildShippingMethod
 * @memberof orderDetailsHelper
 * @param {Object} carrier - shipping carrier object
 * @param {number|null} shippingTotal - total cost of shipped order items
 * @returns {Object|null} Returns shippingMethod object
 */
function buildShippingMethod(carrier, shippingTotal) {
    if (empty(carrier)) {
        return null;
    }
    let { mode, value, displayText } = carrier;
    let shippingMethodID = mode === value ? value : value.concat('_', mode);
    return {
        id: shippingMethodID,
        name: displayText,
        price: typeof shippingTotal === 'number' ? shippingTotal : null
    };
}

/**
 * Parse store hours string and returns todays store hours string
 * @function getCurrentStoreHours
 * @memberof orderDetailsHelper
 * @param {String} storeHoursMarkup - String of store hours
 * @returns {Object|null} Returns todays store hours string
 */
function getCurrentStoreHours(storeHoursMarkup) {
    if (empty(storeHoursMarkup)) {
        return null;
    }
    let days = storeHoursMarkup.split('<br>');
    let day = new Date().getDay();
    let hours = days[day].slice(5).split('-');
    return {
        open: hours[0],
        close: hours[1]
    };
}

/**
 * Builds an array of paymentInstrument details
 * @function getPaymentInstruments
 * @memberof orderDetailsHelper
 * @param {Object} payments - order payments
 * @param {String} billingFullName - full name of person from billing object
 * @param {String|null} walletType - value of 'WalletType' custom attribute for ApplePay
 * @param {Array} paymentMapping - OMS payment mapping array
 * @returns {Array} Returns array of paymentInstrument details
 */

function getPaymentInstruments(payments, billingFullName, walletType, paymentMapping) {
    if (empty(payments)) {
        return [];
    }
    let paymentInstruments = [];
    Object.keys(payments).forEach((key) =>{
        let payment = payments[key];
        let amount = payment.Amount || payment.Authorization && payment.Authorization.AmountAuthorized || null;
        let paymentMethodId = getPaymentMethodId(key, walletType);
        if(['CreditCard', 'StoredValueCard'].includes(key)) {
            if(Array.isArray(payment)){
                payment.forEach(p => {
                    paymentInstruments.push({
                        amount: p.Amount || p.Authorization && p.Authorization.AmountAuthorized || null,
                        paymentMethodId: getPaymentMethodId(key, walletType),
                        paymentCard: getPaymentCard(p, billingFullName, paymentMapping)
                    });
                });
            } else {
                paymentInstruments.push({
                    amount,
                    paymentMethodId,
                    paymentCard: getPaymentCard(payment, billingFullName, paymentMapping)
                });
            }
        } else {
            paymentInstruments.push({
                amount,
                paymentMethodId
            });
        }
    });

    return paymentInstruments.sort((a,b) => {
        if (a.paymentMethodId === 'GIFT_CERTIFICATE') return 1;
        if (b.paymentMethodId === 'GIFT_CERTIFICATE') return -1;
        return b.amount - a.amount;
    });
}

/**
 * Gets payment method id match to support mapping data
 * @function getPaymentMethodId
 * @memberof orderDetailsHelper
 * @param {String} key - payment key
 * @param {String|null} walletType - value of 'WalletType' custom attribute for ApplePay
 * @returns {String|null} Returns payment method id if no match then null
 */
function getPaymentMethodId(key, walletType) {
    let paymentMethodId;
    let compare = empty(walletType) ? key : walletType;
    switch (compare) {
        case 'CreditCard':
            paymentMethodId = 'CREDIT_CARD';
            break;
        case 'PayPal':
            paymentMethodId = 'PayPal';
            break;
        case 'APPLEPAY':
            paymentMethodId = 'DW_APPLE_PAY';
            break;
        case 'StoredValueCard':
            paymentMethodId = 'GIFT_CERTIFICATE';
            break;
        default:
            paymentMethodId = null;
            break;
    }
    return paymentMethodId;
}

/**
 * Builds payment card object
 * @function getPaymentCard
 * @memberof orderDetailsHelper
 * @param {Object} payment - payment
 * @param {String} billingFullName - full name of person from billing object
 * @param {Array} paymentMapping - OMS payment mapping array
 * @returns {Object} Returns payment card object
 */
function getPaymentCard(payment, billingFullName, paymentMapping) {
    let paymentCard = {};
    let tenderType = payment.PaymentContext.TenderType;
    let expirationDate = payment.ExpirationDate || null;
    if (expirationDate) {
        let expirationDates = expirationDate.split('-');
        paymentCard.creditCardExpired = !empty(expirationDate) ? new Date() > new Date(expirationDate) : null;
        paymentCard.expirationMonth = expirationDates.length >= 2 ? parseInt(expirationDates[1]) : null;
        paymentCard.expirationYear = expirationDates.length > 1 ? parseInt(expirationDates[0]) : null;
    }

    let token = payment.PaymentContext.PaymentAccountUniqueId.value;
    let last4Digits = token.slice(-4);
    let maskedNumber = last4Digits.padStart(token.length, '*');

    paymentCard.cardType = tenderType in paymentMapping ? paymentMapping[tenderType] : null;
    paymentCard.holder = billingFullName;
    paymentCard.maskedNumber = maskedNumber;
    paymentCard.numberLastDigits = last4Digits;

    return paymentCard;
}

/**
 * Gets an object of customer details
 * @function getCustomerInfo
 * @memberof orderDetailsHelper
 * @param {Object} orderCustomer - customer object from order response
 * @returns {Object} Returns customerInfo object for response
 */
function getCustomerInfo(orderCustomer) {
    let name = orderCustomer.Name || null;
    let customerName = getFullName(name);
    let email = orderCustomer.EmailAddress || null;
    return { customerName, email };
}

/**
 * Gets concated full name (FirstName + LastName) from name object
 * @function getFullName
 * @memberof orderDetailsHelper
 * @param {Object} nameObj - contains FirstName and LastName
 * @returns {String} Returns full name string
 */
function getFullName(nameObj) {
    let firstName = nameObj.FirstName || null;
    let lastName = nameObj.LastName || null;
    let fullName = null;
    if (firstName && lastName) {
        fullName = firstName.concat(' ', lastName);
    }
    return fullName;
}

/**
 * Maps object data to proper response format
 * @function orderDetailsModel
 * @memberof orderDetailsHelper
 * @param {XML} orderXML - Order XML from OMS
 * @param {Object} paymentMapping - OMS payment map
 * @return {Object} order details custom api response
 */
function orderDetailsModel(orderXML, paymentMapping) {
    let orderResponse = {};
    let options = {
        parse: [
            { property: 'customerOrderId', valueType: 'String' },
            { property: 'Taxes', valueType: 'Array' },
            { property: 'PromotionalDiscounts', valueType: 'Array' },
            { property: 'ShipGroups', valueType: 'Array' },
            { property: 'OrderItems', valueType: 'Array' },
            { property: 'Shipments', valueType: 'Array' },
            { property: 'ShippedItems', valueType: 'Array' }
        ]
    };
    let order = xmlToJson.parseDocument(orderXML, options);

    let currency = order.Currency || null;
    let customAttributes = order && order.CustomAttributes || [];
    let orderNo = order.customerOrderId;
    let customerInfo = getCustomerInfo(order.Customer);
    Object.assign(orderResponse, { customerInfo });


    // Step 1 - Set Product Items
    let orderItems = order.OrderItems || [];
    let items = orderItems.OrderItem ? [orderItems.OrderItem] : orderItems;
    let productItems = getProductItems(items, currency, {}, false);
    Object.assign(orderResponse, { productItems });

    // Step 2 - Set Shipping Response
    let shipping = order.Shipping || {};
    let destinations = shipping.Destinations || {};
    let addresses = flattenArray(Object.values(destinations), 1) || [];
    let shipGroups = shipping.ShipGroups || [];
    let orderShipments = shipping.Shipments || [];
    let { shipments, shippingItems } = getShipments(addresses, shipGroups, orderShipments, items, currency, orderNo);
    shippingItems = getShippingItems(shippingItems, currency);
    Object.assign(orderResponse, {
        shipments,
        shippingItems
    });

    // Step 3 - Set Billing Address
    let payment = order.Payment || {};
    let billingAddressRef = payment.BillingAddress || {};
    let billingAddressRefId = billingAddressRef.ref || null;
    let billingAddressObj = addresses.find(address => address.id === billingAddressRefId) || {};
    let billingAddress = getAddress(billingAddressObj);
    Object.assign(orderResponse, { billingAddress });

    // Step 4 - Set Payment
    let walletTypeAttr = customAttributes.find(attr => attr.Key && attr.Key === 'WALLETTYPE');
    let walletType = walletTypeAttr && walletTypeAttr.Value;
    let payments = order.Payment && order.Payment.Payments || null;
    let paymentInstruments = getPaymentInstruments(payments, billingAddress.fullName, walletType, paymentMapping);

    Object.assign(orderResponse, { paymentInstruments });

    // Step 5 - Set Top level properties
    let orderTotal = paymentInstruments && paymentInstruments[0] && paymentInstruments[0].amount || null;
    let status = order.Status && order.Status.toLowerCase() || null;

    let creationDate = order.CreateTime && new Date(order.CreateTime).toISOString() || null;
    let productTaxTotal = addTotalMoney(productItems, 'tax', currency);
    let shippingTaxTotal = addTotalMoney(shippingItems, 'tax', currency);
    let taxTotal = productTaxTotal.add(shippingTaxTotal)

    Object.assign(orderResponse, {
        creationDate: creationDate,
        currency: currency,
        orderNo: orderNo,
        orderTotal: orderTotal,
        promotionSavings: addTotalMoney(productItems, 'discounts', currency).getValueOrNull(),
        productSubTotal: addTotalMoney(productItems, 'price', currency).getValueOrNull(),
        taxTotal: taxTotal.getValueOrNull(),
        status: status
    });

    return orderResponse;
}


/**
 * Validates request->response order ownership to prevent exposing orders to wrong customer
 * @function validateCustomerOrder
 * @param {XML} orderXML - XML of order details from radial
 * @param {String} orderNo - Requested order number must match xml order number
 * @param {String} orderNo - XML of order details from radial
 * @returns {Object} Returns valid or not valid
 */
function validateCustomerOrder(orderXML, orderNo, customerNo) {
    let orderCustomerId = orderXML.Customer && orderXML.Customer.attribute('customerId').toString();
    let valid = { error: true, message: `Customer number ${customerNo} does not match ${orderCustomerId}` };
    if (customerNo === orderCustomerId) {
        valid.error = false;
    }
    return valid;
}


/**
 * Validates request->response attributes: order id, email, and postal code
 * @function validateGuestOrderTracking
 * @param {XML} orderXML - OMS Order XML
 * @param {String} orderNo - Requested order number must match xml order number
 * @param {String} email - Requested order email must match xml email number
 * @param {String} orderNo - Requested postal code must match xml postal code
 * @returns {Boolean} Returns requests->response validity
 */
function validateGuestOrderTracking(orderXML, orderNo, email, postalCode) {
    const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;
    let valid = false;
    try {
        let customerXML = orderXML && orderXML.Customer;

        // Email address verification
        let orderEmail = customerXML.EmailAddress && customerXML.EmailAddress.toString().toLowerCase();
        if (email !== orderEmail) {
            throw new Error(`Email: ${email} does not match requested order email: ${orderEmail}`);
        }

        // Postal code verification
        let destinations = orderXML.Shipping && orderXML.Shipping.Destinations;
        let mailingAddresses = destinations.elements('MailingAddress');
        let billingAddress;
        for (let i in mailingAddresses) {
            let mailingAddress = mailingAddresses[i];
            let id = mailingAddress.attribute('id').toString();
            if (id.indexOf('billing_address') > -1 || id.indexOf('BIL') > -1) {
                billingAddress = 'Address' in mailingAddress && mailingAddress.Address;
                break;
            }
        }

        let orderPostalCode = billingAddress && billingAddress.PostalCode.toString().toUpperCase();
        let countryCode = billingAddress && billingAddress.CountryCode.toString();
        switch (countryCode) {
            case 'US':
                if (postalCode.length === 5) {
                    postalCode = postalCode.substr(0, 5);
                }
                break;
            case 'CA':
                if (postalCode.length === 6) {
                    postalCode = postalCode.replace(/\s+/g, '');
                }
                break;
            default:
                break;
        }

        if (postalCode !== orderPostalCode) {
            throw new Error(`Postal code: ${postalCode} does not match requested billing postal code: ${orderPostalCode}`);
        }

        valid = true;
    } catch (e) {
        logHandler.logger.error(e, 'CustomAPI', 'order-tracking');
    }
    return valid;
}


module.exports = {
    orderHistoryModel,
    orderDetailsModel,
    validateCustomerOrder,
    validateGuestOrderTracking
}
