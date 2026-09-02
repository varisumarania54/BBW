const ArrayList = require('dw/util/ArrayList');

/**
 * @namespace scapiBasketResponseHelper
 * @description A helper module for converting various commerce objects to SCAPI format
 */

/**
 * @function
 * @description converts a payment instrument to a scapi format
 * @param {dw.order.PaymentInstrument} paymentInstrument
 * @returns {Object} the scapi formatted payment instrument
 */
function convertPaymentInstrumentToSCAPI(paymentInstrument) {
    const paymentInstrumentJson = {
        amount: paymentInstrument.paymentTransaction.amount.value,
        paymentCard: {
            cardType: paymentInstrument.creditCardType,
            creditCardExpired: false,
        },
        paymentInstrumentId: paymentInstrument.UUID,
        paymentMethodId: paymentInstrument.paymentMethod,
    };
    handleCustomAttributes(paymentInstrumentJson, paymentInstrument.custom);
    return paymentInstrumentJson;
}

/**
 * @function
 * @description converts a product item to a scapi format
 * @param {dw.order.ProductLineItem} productLineItem
 * @returns {Object} the scapi formatted product item
 */
function convertProductItemToSCAPI(productLineItem) {
    const productLineItemJson = {
        adjustedTax: productLineItem.adjustedTax.value,
        basePrice: productLineItem.basePrice.value,
        bonusProductLineItem: productLineItem.bonusProductLineItem,
        gift: productLineItem.gift,
        itemId: productLineItem.UUID,
        itemText: productLineItem.productName,
        price: productLineItem.price.value,
        priceAdjustments: convertPriceAdjustmentsToSCAPI(productLineItem.getPriceAdjustments()),
        priceAfterItemDiscount: productLineItem.adjustedPrice.value,
        priceAfterOrderDiscount: productLineItem.adjustedPrice.value,
        productId: productLineItem.productID,
        productName: productLineItem.productName,
        quantity: productLineItem.quantity.value,
        shipmentId: productLineItem.shipment.ID,
        tax: productLineItem.tax.value,
        taxBasis: productLineItem.taxBasis.value,
        taxClassId: productLineItem.taxClassID,
        taxRate: productLineItem.taxRate,
    };

    if (!empty(productLineItem.optionModel) && !empty(productLineItem.optionModel.options)) {
        productLineItemJson.optionItems = productLineItem.optionModel.options.toArray().map((optionItem) => convertOptionItemToSCAPI(optionItem));
    }

    handleCustomAttributes(productLineItemJson, productLineItem.custom);
    return productLineItemJson;
}

/**
 * @function
 * @description converts a product item to a scapi format
 * @param {dw.order.GiftCertificateLineItem} giftCertLineItem
 * @returns {Object} the scapi formatted product item
 */
function convertGiftCertItemToSCAPI(giftCertLineItem) {
    const giftCertLineItemJson = {
        amount: giftCertLineItem.getPrice().value,
        giftCertificateItemId: giftCertLineItem.UUID,
        recipientEmail: giftCertLineItem.recipientEmail,
        recipientName: giftCertLineItem.recipientName,
        senderName: giftCertLineItem.senderName,
        shipmentId: giftCertLineItem.getShipment().ID,
        message: giftCertLineItem.message,
    };
    handleCustomAttributes(giftCertLineItemJson, giftCertLineItem.custom);
    return giftCertLineItemJson;
}

/**
 * @function
 * @description converts a shipment to a scapi format
 * @param {dw.order.Shipment} shipment
 * @returns {Object} the scapi formatted shipment
 */
function convertShipmentToSCAPI(shipment) {
    const shipmentJson = {
        adjustedMerchandizeTotalTax: shipment.adjustedMerchandizeTotalTax.value,
        adjustedShippingTotalTax: shipment.adjustedShippingTotalTax.value,
        gift: shipment.gift,
        merchandizeTotalTax: shipment.merchandizeTotalTax.value,
        productSubTotal: shipment.adjustedMerchandizeTotalNetPrice.value,
        productTotal: shipment.adjustedMerchandizeTotalPrice.value,
        shipmentId: shipment.ID,
        shipmentTotal: shipment.shippingTotalPrice.value,
        shippingStatus: shipment.shippingStatus.displayValue,
        shippingTotal: shipment.totalGrossPrice.value,
        shippingTotalTax: shipment.shippingTotalTax.value,
        taxTotal: shipment.totalTax.value,
    }
    let shippingAddress = shipment.getShippingAddress();
    if (!empty(shippingAddress)) {
        shipmentJson.shippingAddress = {
            address1: shippingAddress.address1,
            city: shippingAddress.city,
            countryCode: shippingAddress.countryCode.value,
            firstName: shippingAddress.firstName,
            fullName: shippingAddress.fullName,
            id: shippingAddress.UUID,
            lastName: shippingAddress.lastName,
            postalCode: shippingAddress.postalCode,
            stateCode: shippingAddress.stateCode,
        }
    }
    if (!empty(shipment.shippingMethod)) {
        const ShippingMgr = require("dw/order/ShippingMgr");

        shipmentJson.shippingMethod = {
            description: shipment.shippingMethod.description,
            id: shipment.shippingMethod.ID,
            name: shipment.shippingMethod.displayName,
            price: ShippingMgr.getShippingCost(shipment.shippingMethod, shipment.shippingTotalPrice).value,
        }
        handleCustomAttributes(shipmentJson.shippingMethod, shipment.shippingMethod.custom);
    }
    handleCustomAttributes(shipmentJson, shipment.custom);
    return shipmentJson;
}

/**
 * @function
 * @description converts a coupon item to a scapi format
 * @param {dw.order.CouponLineItem} couponItem
 * @returns {Object} the scapi formatted coupon item
 */
function convertCouponItemToSCAPI(couponItem) {
    const couponjson = {
        code: couponItem.couponCode,
        couponItemId: couponItem.UUID,
        statusCode: couponItem.statusCode.toLowerCase(),
        valid: couponItem.valid,
    };
    handleCustomAttributes(couponjson, couponItem.custom);
    return couponjson;
}

/**
 * @function
 * @description Converts all shipping line items in the given basket to a SCAPI format.
 * @param {dw.order.Basket} basket - The basket containing shipments with shipping line items to convert.
 * @returns {dw.util.ArrayList} An ArrayList of SCAPI formatted shipping items.
 */
function convertShippingItemsToSCAPI(basket) {
    const shippingItemsArray = new ArrayList();
    basket.getShipments().toArray().forEach(shipment => {
        shipment.getShippingLineItems().toArray().forEach(shippingItem => {
            const shippingItemJson = {
                adjustedTax: shippingItem.adjustedTax.value,
                basePrice: shippingItem.basePrice.value,
                itemId: shippingItem.UUID,
                itemText: shippingItem.getLineItemText(),
                price: shippingItem.price.value,
                shipmentId: shipment.ID,
                tax: shippingItem.tax.value,
                taxBasis: shippingItem.taxBasis.value,
                taxClassId: shippingItem.getTaxClassID(),
                taxRate: shippingItem.getTaxRate(),
            };
            handleCustomAttributes(shippingItemJson, shippingItem.custom);
            shippingItemsArray.add(shippingItemJson);
        });
    });
    return shippingItemsArray;
}

/**
 * Converts the grouped tax items in the given basket to a SCAPI format
 * @param {dw.order.Basket} basket - The basket containing the grouped tax items to convert
 * @returns {Array} An array of SCAPI formatted grouped tax items
 */
function convertGroupedTaxItemsToSCAPI(basket) {
    let groupedTaxItems = [];
    let keys = basket.taxTotalsPerTaxRate.keySet().iterator();
    while (keys.hasNext()) {
        let taxRate = keys.next();
        let taxValue = basket.taxTotalsPerTaxRate.get(taxRate);
        groupedTaxItems.push({
            'taxRate': taxRate.get(),
            'taxValue': taxValue.value
        })
    }
    return groupedTaxItems;
}

/**
 * @function
 * @description Converts a basket to a SCAPI format
 * @param {dw.order.Basket} basket - The basket object to convert
 * @returns {Object} The SCAPI formatted basket
 */
function convertBasketToSCAPI(basket) {
    const json = {
        adjustedMerchandizeTotalTax: basket.adjustedMerchandizeTotalTax.value,
        adjustedShippingTotalTax: basket.adjustedShippingTotalTax.value,
        agentBasket: basket.agentBasket,
        basketId: basket.UUID,
        channelType: basket.channelType ? basket.channelType.displayValue.toLowerCase() : '',
        couponItems: new ArrayList(basket.couponLineItems.toArray().map((couponItem) => convertCouponItemToSCAPI(couponItem))),
        creationDate: basket.creationDate,
        currency: basket.currencyCode,
        customerInfo: {
            customerId: basket.customer.ID,
        },
        groupedTaxItems: convertGroupedTaxItemsToSCAPI(basket),
        lastModified: basket.lastModified,
        merchandizeTotalTax: basket.merchandizeTotalTax.value,
        notes: basket.notes,
        orderPriceAdjustments: convertPriceAdjustmentsToSCAPI(basket.getPriceAdjustments()),
        orderTotal: basket.totalGrossPrice.value,
        productItems: new ArrayList(basket.productLineItems.toArray().map((productLineItem) => convertProductItemToSCAPI(productLineItem))),
        productSubTotal: basket.getAdjustedMerchandizeTotalNetPrice().value,
        productTotal: basket.getAdjustedMerchandizeTotalPrice().value,
        shippingTotal: basket.adjustedShippingTotalPrice.value,
        shippingTotalTax: basket.adjustedShippingTotalTax.value,
        taxation: 'net',
        taxTotal: basket.totalTax.value,
        taxRoundedAtGroup: basket.taxRoundedAtGroup,
        temporaryBasket: basket.temporary,
    };

    // Add billing address if it exists
    let billingAddress = basket.getBillingAddress();
    if (billingAddress) {
        json.billingAddress = {
            address1: billingAddress.address1,
            city: billingAddress.city,
            countryCode: billingAddress.countryCode.value,
            firstName: billingAddress.firstName,
            fullName: billingAddress.fullName,
            id: billingAddress.UUID,
            lastName: billingAddress.lastName,
            postalCode: billingAddress.postalCode,
            stateCode: billingAddress.stateCode,
        };
        handleCustomAttributes(json.billingAddress, billingAddress.custom);
    }


    if (basket.paymentInstruments.length > 0) {
        json.paymentInstruments = new ArrayList(basket.paymentInstruments.toArray().map((paymentInstrument) => convertPaymentInstrumentToSCAPI(paymentInstrument)));
    }

    if (basket.shipments.length > 0) {
        json.shipments = new ArrayList(basket.shipments.toArray().map((shipment) => convertShipmentToSCAPI(shipment)));
        json.shippingItems = convertShippingItemsToSCAPI(basket);
    }

    // Add gift certificate items if any exist
    if (basket.giftCertificateLineItems.length > 0) {
        json.giftCertificateItems = new ArrayList(basket.giftCertificateLineItems.toArray().map((giftCertLineItem) => convertGiftCertItemToSCAPI(giftCertLineItem)));
    }

    // Handle custom attributes
    handleCustomAttributes(json, basket.custom);

    // Add customer email if it's not empty
    json.customerInfo.email = !empty(basket.customerEmail) ? basket.customerEmail : "";

    return json;
}
/**
 * @function
 * @description Handles converting custom attributes from a custom field to a target object with a prepended "c_".
 * Iterates through each key in the custom attributes object, and appends the key-value pairs to the target object,
 * prefixing the keys with "c_".
 * @param {Object} targetObj - The object to which the custom attributes will be added.
 * @param {Object} customAttbObject - The object containing custom attributes to be converted.
 */
function handleCustomAttributes(targetObj, customAttbObject) {
    Object.keys(customAttbObject).forEach((key) => {
        let value = customAttbObject[key];
        switch (typeof value) {
            case ('object'):
                targetObj["c_" + key] = value.toString()
                break;
            default:
                targetObj["c_" + key] = value

        }
    });
}

/**
 * @function
 * @description Converts a price adjustment to the SCAPI format
 * @param {dw.order.PriceAdjustment} pa - The price adjustment object to convert
 * @returns {Object} The SCAPI formatted price adjustment
 */
function convertPriceAdjustmentsToSCAPI(priceAdjustments) {
    let data = [];

    priceAdjustments.toArray().forEach(priceAdjustment => {
        const paJson = {
            appliedDiscount: convertDiscountToSCAPI(priceAdjustment.appliedDiscount),
            couponCode: !empty(priceAdjustment.couponLineItem) ? priceAdjustment.couponLineItem.couponCode : null,
            "createdBy": "storefront",
            "creationDate": priceAdjustment.getCreationDate(),
            "custom": priceAdjustment.createdBy != 'System',
            "itemText": priceAdjustment.lineItemText,
            "lastModified": priceAdjustment.getLastModified(),
            "manual": priceAdjustment.manual,
            "price": priceAdjustment.price.value,
            "priceAdjustmentId": priceAdjustment.UUID,
            "promotionId": priceAdjustment.getPromotionID()
        };
        handleCustomAttributes(paJson, priceAdjustment.custom);

        data.push(paJson);
    });
    return new ArrayList(data);
}

/**
 * @function
 * @description Converts a discount to the SCAPI format
 * @param {dw.campaign.Discount} discount - The discount object to convert
 * @returns {Object} The SCAPI formatted discount
 */
function convertDiscountToSCAPI(discount) {
    const appliedDiscountJson = {
    }
    switch (discount.type) {
        case ('AMOUNT'):
            appliedDiscountJson.amount = discount.amount;
            break;
        case ('BONUS'):
            break;
        case ('BONUS_CHOICE'):
            break;
        case ('FIXED_PRICE_SHIPPING'):
        case ('FIXED_PRICE'):
            appliedDiscountJson.amount = discount.fixedPrice
            break;
        case ('FREE'):
            break;
        case ('FREE_SHIPPING'):
            break;
        case ('PERCENTAGE_OFF_OPTIONS'):
        case ('PERCENTAGE'):
            appliedDiscountJson.amount = discount.percentage / 100
            appliedDiscountJson.percentage = discount.percentage
            break;
        case ('PRICE_BOOK_PRICE'):
            appliedDiscountJson.priceBookId = discount.priceBookID
            break;
        case ('TOTAL_FIXED_PRICE'):
            appliedDiscountJson.amount = discount.totalFixedPrice
            break;
    }
    appliedDiscountJson.type = discount.type.toLowerCase();
    return appliedDiscountJson;
}
/**
 * @function
 * @description Converts array lists to arrays for stringification
 * @param {Object} json
 */
function convertListToArray(json) {
    Object.keys(json).forEach((key) => {
        let value = json[key];
        if (empty(value)) {
            delete json[key];
        }
        else {
            switch (typeof value) {
                case ('object'):
                    try {
                        if ('length' in value) {
                            json[key] = value.toArray();
                            json[key].forEach(element => {
                                convertListToArray(element);
                            });
                        }
                        else {
                            convertListToArray(value);
                        }
                    }
                    catch (e) {
                    }
                    break;
                default:


            }
        }
    });
}

module.exports = {
    convertBasketToSCAPI,
    convertListToArray
}
