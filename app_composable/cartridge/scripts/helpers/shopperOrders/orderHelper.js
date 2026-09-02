'use strict';

const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;

/**
 * convert SFCC order object to plain JSON object
 * @function convertOrderToJSON
 * @param {dw.order.Order} order - The sfcc order object
 */
function convertOrderToJSON(order) {
    if (!order) {
        return {};
    }
    try{
        let orderData = {
            orderNo: order.orderNo,
            orderToken: order.orderToken,
            channelType: order.channelType ? order.channelType.displayValue : null,
            confirmationStatus: order.confirmationStatus.displayValue,
            status: order.status.displayValue,
            createdBy: order.createdBy,
            creationDate: order.creationDate,
            lastModified: order.lastModified,
            currency: order.currencyCode,
            orderTotal: order.totalGrossPrice,
            taxTotal: order.totalTax,
            shippingTotal: order.shippingTotalPrice,
            merchandizeTotalTax: order.merchandizeTotalTax,
            adjustedMerchandizeTotalTax: order.adjustedMerchandizeTotalTax,
            adjustedShippingTotalTax: order.adjustedShippingTotalTax,
            customerInfo: {
                customerId: order.customer ? order.customer.ID : null,
                customerName: order.customerName,
                email: order.customerEmail,
                guest: order.customer ? order.customer.authenticated : true
            }, 
            orderPriceAdjustments: getPriceAdjustments(order.getPriceAdjustments()),
            customAttributes: getCustomAttributes(order.custom)
    
        };

        let shipmentsIter = order.getShipments().iterator();
        let shipments = [];
        while (shipmentsIter.hasNext()) {
            let shipment = shipmentsIter.next();
            let basketShipment = {
                shipmentId: shipment.ID,
                shipmentNo: shipment.shipmentNo,
                shipmentTotal: shipment.adjustedMerchandizeTotalPrice.value + shipment.adjustedShippingTotalPrice.value,
                shippingMethod: shipment.shippingMethod ? {
                    id: shipment.shippingMethod.ID,
                    name: shipment.shippingMethod.displayName,
                    description: shipment.shippingMethod.description,
                    price: shipment.shippingTotalPrice.value
                } : null,
                shippingAddress: getAddress(shipment.shippingAddress),
                shippingStatus: shipment.shippingStatus.displayValue,
                customAttributes: getCustomAttributes(shipment.custom)
            }
            shipments.push(basketShipment);
        }
        orderData.shipments = shipments;
        
        let productItems= [];
        let pliIter = order.getProductLineItems().iterator();
        while (pliIter.hasNext()) {
            let pli = pliIter.next();
            let product = {
                itemId: pli.UUID,
                productId: pli.productID,
                productName: pli.productName,
                quantity: pli.quantity.value,
                basePrice: pli.basePrice.value,
                price: pli.grossPrice.value,
                priceAfterDiscount: pli.adjustedPrice.value,
                tax: pli.adjustedTax.value,
                taxRate: pli.taxRate,
                priceAdjustments: getPriceAdjustments(pli.getPriceAdjustments()),
                customAttributes: getCustomAttributes(pli.custom)
            }
            productItems.push(product);
            
        }
        orderData.productItems = productItems;

        let  promotions = [];
        let promoIter = order.getPriceAdjustments().iterator();
        while (promoIter.hasNext()) {
            let promo = promoIter.next();
            let promotion ={
                promotionID: promo.promotionID,
                description: promo.promotion ? promo.promotion.calloutMsg : null,
                discount: promo.price.value,
                couponCode: promo.couponCode || null
            };
            promotions.push(promotion); 
        }
        orderData.promotions = promotions;

        let couponItems = [];
        let couponIter = order.getCouponLineItems().iterator();
        while (couponIter.hasNext()) {
            let coupon = couponIter.next();
            let couponItem ={
                code: coupon.couponCode,
                statusCode: coupon.statusCode,
                valid: coupon.valid,
                customAttributes: getCustomAttributes(coupon.custom)
            };
            couponItems.push(couponItem)
        }
        orderData.couponItems = couponItems;

        let paymentInstruments = [];
        let piIter = order.getPaymentInstruments().iterator();
        while (piIter.hasNext()) {
            let pi = piIter.next();
            let paymentInstrument = {
                paymentInstrumentId: pi.UUID,
                paymentMethod: pi.paymentMethod,
                amount: pi.paymentTransaction.amount.value,
                cardType: pi.creditCardType || null,
                maskedCardNumber: pi.maskedCreditCardNumber || null,
                expirationMonth: pi.creditCardExpirationMonth || null,
                expirationYear: pi.creditCardExpirationYear || null,
                holder: pi.creditCardHolder || null,
                customAttributes: getCustomAttributes(pi.custom)
            };
            paymentInstruments.push(paymentInstrument)
        }
        orderData.paymentInstruments = paymentInstruments;

        return orderData;
    }catch (e){
        logHandler.logger.error(e,'Hooks','AfterPostOrder')
    }
}

function getAddress(address) {
    if (!address) return null;
    return {
        firstName: address.firstName,
        lastName: address.lastName,
        fullName: address.fullName,
        address1: address.address1,
        address2: address.address2,
        city: address.city,
        stateCode: address.stateCode,
        postalCode: address.postalCode,
        countryCode: address.countryCode.value,
        phone: address.phone
    };
}

function getCustomAttributes(customObj) {
    if (!customObj) return {};
    let customData = {};
    let keys = Object.keys(customObj);
    keys.forEach(key => {
     customData[key] = customObj[key];
    })
    return customData;
}

function getPriceAdjustments(priceAdjustments) {
    let adjustments = [];
    let iter = priceAdjustments.iterator();
    while (iter.hasNext()) {
        let adj = iter.next();
        adjustments.push({
            promotionID: adj.promotionID,
            discount: adj.price.value,
            type: adj.type,
            calloutMessage: adj.promotion ? adj.promotion.calloutMsg : null
        });
    }
    return adjustments;
}

module.exports = {
    convertOrderToJSON
};