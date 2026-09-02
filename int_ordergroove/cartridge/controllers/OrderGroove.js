/* eslint-disable */
'use strict';

/**
 * This controller implements end points for OrderGroove to authenticate the MSI
 * and to place recurring orders.
 *
 * @module controllers/OrderGroove
 */

/* Global API Includes */
var HookMgr = require('dw/system/HookMgr');
var Logger = require('dw/system/Logger');
var ISML = require('dw/template/ISML');
var Pipeline = require('dw/system/Pipeline');

exports.Auth = function () {
    if (request.getHttpMethod() !== 'GET') {
        // switching is not possible, set status 403 (forbidden)
        response.setStatus(403);
        return;
    }
    if (request.isHttpSecure() === false) {
        var url = 'https://' + request.httpHost + request.httpPath;
        if (request.httpQueryString !== null) {
            url += '?' + request.httpQueryString;
        }
        response.redirect(url);
        return;
    }

    // Render HMAC authentication
    if (customer.isAuthenticated()) {
        var customerID = customer.getProfile().getCustomerNo();
        if (HookMgr.hasHook('ordergroove.encryptor')) {
            var sig = HookMgr.callHook('ordergroove.encryptor', 'signature', customerID);
            if (typeof sig === 'object') {
                var signature = sig.signature;
                ISML.renderTemplate('printer', {
                    Message: signature
                });
            } else {
                ISML.renderTemplate('printer', {
                    Message: ''
                });
            }
        } else {
            ISML.renderTemplate('printer', {
                Message: ''
            });
        }
    } else {
        ISML.renderTemplate('printer', {
            Message: ''
        });
    }
    return;
};

exports.AuthIframe = function () {
    /* Local API Includes */
    var ArrayList = require('dw/util/ArrayList');
    var Cookie = require('dw/web/Cookie');

    if (request.getHttpMethod() !== 'GET') {
        // switching is not possible, set status 403 (forbidden)
        response.setStatus(403);
        return;
    }
    if (request.isHttpSecure() === false) {
        var url = 'https://' + request.httpHost + request.httpPath;
        if (request.httpQueryString !== null) {
            url += '?' + request.httpQueryString;
        }
        response.redirect(url);
        return;
    }
    if (customer.isAuthenticated()) {
        var customerID = customer.getProfile().getCustomerNo();
        if (HookMgr.hasHook('ordergroove.encryptor')) {
            var auth = HookMgr.callHook('ordergroove.encryptor', 'signature', customerID);
            var sig = auth.signature;
            var timestamp = auth.timestamp;
            var contentList = new ArrayList();
            contentList.add1(customerID);
            contentList.add1(timestamp);
            contentList.add1(sig);
            var content = contentList.join('|');
            var cookie = new Cookie('og_auth', content);
            cookie.setSecure(true); // secure cookie
            cookie.setMaxAge(7200); // 2 hour expiration in seconds
            cookie.setPath('/'); // base path
            response.addHttpCookie(cookie);
        }
    }

    // Render authentication page
    ISML.renderTemplate('authentication');
    return;
};

exports.MSI = function () {
    /* Local API Includes */
    var URLUtils = require('dw/web/URLUtils');

    if (request.isHttpSecure() === false) {
        var url = 'https://' + request.httpHost + request.httpPath;
        if (request.httpQueryString !== null) {
            url += '?' + request.httpQueryString;
        }
        response.redirect(url);
        return;
    }
    if (customer.isAuthenticated() === false) {
        response.redirect(URLUtils.https('Account-Show'));
        return;
    }

    // Render MSI page
    ISML.renderTemplate('account/subscriptions/msi');
    return;
};

exports.OrderPlacement = function () {
    try {
        /* Local API Includes */
        const CustomerMgr = require('dw/customer/CustomerMgr');
        const BasketMgr = require('dw/order/BasketMgr');
        const Transaction = require('dw/system/Transaction');
        const ShippingMgr = require('dw/order/ShippingMgr');
        const Site = require('dw/system/Site');
        const HashMap = require('dw/util/HashMap');
        const OrderMgr = require('dw/order/OrderMgr');
        const Order = require('dw/order/Order');
        const Status = require('dw/system/Status');
        const System = require('dw/system/System');
        const OrdergrooveHelper = require('int_ordergroove/cartridge/scripts/customOrderGroove.js').OrdergrooveHelper;
        const autoRefreshHelper = require('int_ordergroove/cartridge/scripts/autoRefreshHelper.js');
        const log = Logger.getLogger('ordergroove', 'OG');
        const AllocationHelper = require('int_radial_composable/cartridge/scripts/rom/inventory/allocateInventoryHelper.js');
        const creditAuth = require('int_radial_composable/cartridge/scripts/payments/creditcard/creditCardServiceHelper.js');
        const calculate = require('app_composable/cartridge/scripts/hooks/shopperBaskets/calculate.js').calculate
        const createRadialOrder = require('int_radial_composable/cartridge/scripts/rom/order/createOrderHelper.js').createOrderROM;
        const enableOGRefactor = Site.current.getCustomPreferenceValue('enableOGRefactor');
        const taxService = require('int_radial_composable/cartridge/scripts/rom/tax/taxServiceHelper.js');

        if (Site.getCurrent().getCustomPreferenceValue('OrderGrooveEnable') === null || Site.getCurrent().getCustomPreferenceValue('OrderGrooveEnable') === false) {
            ISML.renderTemplate('ErrorXML', {
                ErrorCode: '999',
                ErrorMsg: 'The endpoint is currently disabled.'
            });
            log.error('Order Groove create order failed due to : Order Groove is disabled');
            return;
        }
        if (request.isHttpSecure() === false) {
            ISML.renderTemplate('ErrorXML', {
                ErrorCode: '999',
                ErrorMsg: 'The HTTP communication is not secure.'
            });
            log.error('Order Groove create order failed due to :  request was not secure');

            return;
        }
        if (request.getHttpMethod() !== 'POST') {
            ISML.renderTemplate('ErrorXML', {
                ErrorCode: '999',
                ErrorMsg: 'The HTTP method is forbidden.'
            });
            log.error('Order Groove create order failed due to :  request was sent as a ' + request.getHttpMethod() + ' Not a POST');
            return;
        }

        // Check if required hook exists
        if (HookMgr.hasHook('ordergroove.encryptor') === false) {
            ISML.renderTemplate('ErrorXML', {
                ErrorCode: '999',
                ErrorMsg: 'The hook ordergroove.encryptor is not established and is required.'
            });
            log.error('Order Groove create order failed due to :  encryptor hook is not working');
            return;
        }

        // Retrieve posted query string OrderGroove
        var map = request.getHttpParameterMap();
        var xml = new XML(map.getRequestBodyAsString());
        if (xml.children().length() === 0) {
            ISML.renderTemplate('ErrorXML', {
                ErrorCode: '999',
                ErrorMsg: 'The request body was empty or not XML.'
            });
            log.error('Order Groove create order failed due to :  The request body was empty or not XML');
            return;
        }
        var headXML = xml.child('head');
        var customerXML = xml.child('customer');

        // Get customer record
        var customerNo = customerXML.child('customerPartnerId').toString();
        var customer = CustomerMgr.getCustomerByCustomerNumber(customerNo);
        if (customer === null) {
            ISML.renderTemplate('ErrorXML', {
                ErrorCode: '999',
                ErrorMsg: 'Could not obtain a customer record for the provided customer number.'
            });
            log.error('Order Groove create order failed due to :  No customer matching ' + customerNo);
            return;
        }

        // Verify signature from header
        var headers = request.getHttpHeaders();

        if (headers.containsKey('authorization') && System.getInstanceType() === System.PRODUCTION_SYSTEM) {
            var auth = headers.get('authorization');
            var verified = HookMgr.callHook('ordergroove.encryptor', 'verify', customerNo, auth);
            if (verified === false) {
                ISML.renderTemplate('ErrorXML', {
                    ErrorCode: '403',
                    ErrorMsg: 'Signature could not be verified to perform a request.'
                });
                log.error('Order Groove create order failed due to : Signature could not be verified to perform a request.');
                return;
            }
        } else if (headers.containsKey('x-ordergroove-authorization') && System.getInstanceType() != System.PRODUCTION_SYSTEM) {
            var auth = headers.get('x-ordergroove-authorization');
            var verified = HookMgr.callHook('ordergroove.encryptor', 'verify', customerNo, auth);
            if (verified === false) {
                ISML.renderTemplate('ErrorXML', {
                    ErrorCode: '403',
                    ErrorMsg: 'Signature could not be verified to perform a request.'
                });
                log.error('Order Groove create order failed due to : Signature could not be verified to perform a request.');
                return;
            }
        } else {
            if (empty(Site.getCurrent().getCustomPreferenceValue('OrderGrooveRequireSignature')) || Site.getCurrent().getCustomPreferenceValue('OrderGrooveRequireSignature')) {
                ISML.renderTemplate('ErrorXML', {
                    ErrorCode: '403',
                    ErrorMsg: 'Signature authorization is required.'
                });
                log.error('Order Groove create order failed due to : Signature authorization is required.');
                return;
            }
        }

        // Get or create basket
        var basket = BasketMgr.getCurrentOrNewBasket();

        // Gather line items and manually increment quantity for duplicates since pricing gets override
        var itemsXML = xml.child('items');

        var productMap = new HashMap();
        for (var i = Number(0); i < itemsXML.children().length(); i++) {
            var item = itemsXML.children()[i];
            var itemtype = item.child('item_type').toString();
            var productKey = item.child('sku').toString();
            if (productMap.containsKey(productKey) === false) {
                var product = {};
                product.sku = productKey;
                product.qty = Number(item.child('qty').toString());
                product.finalPrice = Number(item.child('finalPrice').toString());
                product.itemtype = itemtype;
                product.discountoff = item.child('discount').toString();
                productMap.put(productKey, product);
            } else {
                productMap.get(productKey).qty += Number(item.child('qty').toString());
                productMap.get(productKey).finalPrice += Number(item.child('finalPrice').toString());
            }
        }

        Transaction.wrap(function () {
            // Set customer number and email for basket
            basket.setCustomerNo(customer.getProfile().getCustomerNo());
            basket.setCustomerEmail(customer.getProfile().getEmail());

            // Get default shipment and create shipping address based on XML
            var shipment = basket.getDefaultShipment();
            var shippingAddress = shipment.createShippingAddress();
            shippingAddress.setCompanyName(customerXML.customerShippingCompany.toString());
            shippingAddress.setFirstName(customerXML.customerShippingFirstName.toString());
            shippingAddress.setLastName(customerXML.customerShippingLastName.toString());
            shippingAddress.setAddress1(customerXML.customerShippingAddress1.toString());
            shippingAddress.setAddress2(customerXML.customerShippingAddress2.toString());
            shippingAddress.setCity(customerXML.customerShippingCity.toString());
            shippingAddress.setPostalCode(customerXML.customerShippingZip.toString());
            shippingAddress.setStateCode(customerXML.customerShippingState.toString());
            shippingAddress.setCountryCode(customerXML.customerShippingCountry.toString().toUpperCase());
            shippingAddress.setPhone(customerXML.customerShippingPhone.toString());


            // Create product line items and set cost
            var items = productMap.values().toArray();
            var autoRefreshTotalAmount = 0;
            items.forEach(function (item) {
                var productID = item.sku;
                var pli = basket.createProductLineItem(productID, shipment);
                var qty = item.qty;
                pli.setQuantityValue(qty);
                var price = item.finalPrice;
                var discountoff = item.discountoff;
                price /= qty;
                pli.setPriceValue(price);
                pli.custom.isAutoRefreshSubscribedItem = true;
                pli.custom.ARSubscriptionType = item.itemtype;

                //promo price adjustment
                autoRefreshHelper.removePLIPriceAdjustments(pli);
                autoRefreshHelper.addARPriceAdjustment(pli, null, true, item.discountoff);
                autoRefreshTotalAmount = autoRefreshTotalAmount + pli.adjustedPrice.value;
            });

            // Set shipping method
            var shipMethodID = Site.getCurrent().getCustomPreferenceValue('OrderGrooveShippingMethod') !== null ? Site.getCurrent().getCustomPreferenceValue('OrderGrooveShippingMethod') : null;
            //New orderGroove ship logic
            if (Site.getCurrent().getCustomPreferenceValue('OrderGrooveStandardShippingLogicEnabled')) {
                var shippingModel = ShippingMgr.getShipmentShippingModel(shipment);
                var applicableShippingMethods = shippingModel.getApplicableShippingMethods().toArray();
                var defualtOGShipMethods = applicableShippingMethods.filter(e => e.ID === shipMethodID);
                if (defualtOGShipMethods.length > 0) {
                    shipment.setShippingMethod(defualtOGShipMethods[0]);
                }
                else {
                    var alternativeShippingMethods = applicableShippingMethods.filter(e => e.displayName == 'Standard');
                    if (empty(alternativeShippingMethods)) {
                        ISML.renderTemplate('ErrorXML', {
                            ErrorCode: '400',
                            ErrorMsg: 'No Shipping methods available for the shipping address.'
                        });
                        log.error('Order Groove create order failed due to : No Shipping methods available for the shipping address.');
                        return;
                    }
                    //set first applicable shipping method
                    shipment.setShippingMethod(alternativeShippingMethods[0]);
                }
            }
            else {
                var methods = ShippingMgr.getAllShippingMethods().iterator();
                var customerMethod = null;
                while (methods.hasNext()) {
                    var method = methods.next();
                    if (method.getID() === shipMethodID) {
                        customerMethod = method;
                        break;
                    }
                }
                shipment.setShippingMethod(customerMethod);
            }

            // Set shipping cost
            var sli = shipment.getStandardShippingLineItem();
            var shippingCost = Number(customerXML.child('orderShipping').toString());
            var isSkipShipping = OrdergrooveHelper.shippingPromotion(basket, shippingCost, autoRefreshTotalAmount);
            sli.setPriceValue(shippingCost);

            //Call Cart-Calculate only if the shipping address is available so it will not affect the Tax Calculation service call

            if (basket && basket.defaultShipment && basket.defaultShipment.shippingAddress) {
                if(enableOGRefactor){
                    request.custom.isPlaceOrderGroove = true;
                    calculate(basket,false);
                    taxService.calculateRealTaxesOnBasket(basket, true);

                }else{
                    var pdict = Pipeline.execute('Cart-Calculate', {
                        Basket: basket,
                        isARTaxCall: true,
                        isSkipShipping: isSkipShipping
                    });
                }
            }

            // create Billing Address
            OrdergrooveHelper.createBillingAddress(basket, customerXML, customer);

            // Update totals and do not call calculate hook since it will override prices, promotions, and taxes
            basket.updateTotals();

            //handle payment instrument
            OrdergrooveHelper.handlePaymentInstrument(basket, headXML, customer);

            basket.setChannelType(basket.CHANNEL_TYPE_SUBSCRIPTIONS);

            //inventory Availability check
            var inventoryAvailabilityCheck = OrdergrooveHelper.inventoryAvailabilityCheck(basket);
            if (inventoryAvailabilityCheck == false) {
                ISML.renderTemplate('ErrorXML', {
                    ErrorCode: '999',
                    ErrorMsg: 'Order Failed Due to Real Time Inventory Check.'
                });
                log.error('Order Groove create order failed due to : Not enough inventory. Products in the basket : ' + getProductsString(basket));
                return;
            }
            var order = OrderMgr.createOrder(basket);
            order.custom.platform = 'ORDERGROOVE'

            // Tie customer record to the order
            order.setCustomer(customer);

            // Authorize credit card
            let allocationError = false;
            if(enableOGRefactor){
                try {
                    AllocationHelper.AllocateOrder(order)
                } catch (e) {
                    allocationError = true
                    AllocationHelper.RollbackOrder(order);
                }
            }else {
                var radialInventoryAllocation = Pipeline.execute('Radial-ReserveInventory', {
                    Order: order
                });
                if (radialInventoryAllocation.EndNodeName == 'ERROR') {
                    allocationError = true
                    Pipeline.execute('Radial-InventoryRollback', {
                        Order: order,
                        RadialReservationBopisId: radialInventoryAllocation.RadialReservationBopisId,
                        RadialReservationId: radialInventoryAllocation.RadialReservationId
                    });
                }
            }

            if (allocationError) {
                ISML.renderTemplate('ErrorXML', {
                    ErrorCode: '020',
                    ErrorMsg: 'Failed to do Inventory Allocation'
                });
                log.error('Order Groove create order failed due to : Allocation Failed. Products in the basket : ' + getProductsString(basket));
                return new Status(Status.ERROR);
            }

            if(enableOGRefactor){
                const authRes = creditAuth.creditCardAuthorize(order, order.paymentInstrument, null, order.orderNo);
            // Handle Radial authorization result & Place order
                if (authRes.success) {
                    OrderMgr.placeOrder(order);
                } else {
                    AllocationHelper.RollbackOrder(order);
                    OrderMgr.failOrder(order);

                    // BE-17: Check authResult existence before accessing properties
                    if (empty(authRes.authResult)) {
                        // authResult is missing — service call failed, timed out, or threw an exception
                        log.error('BE-17: OG auth failed - authResult missing | orderNo: ' + order.orderNo
                            + ' | authResKeys: ' + (authRes ? Object.keys(authRes).join(',') : 'null')
                            + ' | responseCode: ' + (authRes.responseCode || 'N/A')
                            + ' | errorMessage: ' + (authRes.errorMessage || 'N/A'));
                        ISML.renderTemplate('ErrorXML', {
                            ErrorCode: '020',
                            ErrorMsg: 'Technical issue during payment authorization'
                        });
                    } else if (!empty(authRes.authResult.avsResponseCode) && ['N', 'AW'].indexOf(authRes.authResult.avsResponseCode.toString()) > -1) {
                        // AVS response indicates bad billing address
                        log.error('BE-17: OG auth failed - AVS decline | orderNo: ' + order.orderNo
                            + ' | avsResponseCode: ' + authRes.authResult.avsResponseCode
                            + ' | responseCode: ' + (authRes.authResult.responseCode || 'N/A')
                            + ' | authResultKeys: ' + Object.keys(authRes.authResult).join(','));
                        ISML.renderTemplate('ErrorXML', {
                            ErrorCode: '130',
                            ErrorMsg: 'Invalid Billing Address'
                        });
                    } else if (!empty(authRes.authResult.authorizationResponseCode) && ['ND01', 'ND02', '081'].indexOf(authRes.authResult.authorizationResponseCode.toString()) > -1) {
                        ISML.renderTemplate('ErrorXML', {
                            ErrorCode: '140',
                            ErrorMsg: 'Payment Decline'
                        });
                     } else if (authRes.authResult.responseCode != 'APPROVED') {
                        log.error('BE-17: OG auth failed - Auth decline | orderNo: ' + order.orderNo
                            + ' | avsResponseCode: ' + authRes.authResult.avsResponseCode
                            + ' | responseCode: ' + (authRes.authResult.responseCode || 'N/A')
                            + ' | authResultKeys: ' + Object.keys(authRes.authResult).join(','));
                        ISML.renderTemplate('ErrorXML', {
                            ErrorCode: '140',
                            ErrorMsg: 'Payment Decline'
                        }); 
                    } else {
                        // Catch-all for any other non-approved auth result
                        log.error('BE-17: OG auth failed - unhandled reason | orderNo: ' + order.orderNo
                            + ' | responseCode: ' + (authRes.authResult.responseCode || 'N/A')
                            + ' | authorizationResponseCode: ' + (authRes.authResult.authorizationResponseCode || 'N/A')
                            + ' | avsResponseCode: ' + (authRes.authResult.avsResponseCode || 'N/A')
                            + ' | authResultKeys: ' + Object.keys(authRes.authResult).join(','));
                        ISML.renderTemplate('ErrorXML', {
                            ErrorCode: '999',
                            ErrorMsg: 'A technical error occurred while creating the order.'
                        });
                    }
                    return;
                }
            }else{
                var pdict = Pipeline.execute('RADIAL_CREDIT-Authorize', {
                    Order: order,
                    cvn: " "
                });
                // Handle Radial authorization result & Place order
                if (pdict.EndNodeName == 'authorized') {
                    OrderMgr.placeOrder(order);
                } else {
                    var radialInventoryRollback = Pipeline.execute('Radial-InventoryRollback', {
                        Order: order,
                        RadialReservationBopisId: radialInventoryAllocation.RadialReservationBopisId,
                        RadialReservationId: radialInventoryAllocation.RadialReservationId
                    });

                    OrderMgr.failOrder(order);
                    if (pdict.EndNodeName == 'error') {
                        if (pdict.result == null || radialInventoryRollback.EndNodeName == 'ERROR') {
                            ISML.renderTemplate('ErrorXML', {
                                ErrorCode: '020',
                                ErrorMsg: 'Technical issue during payment authorization'
                            });
                        } else if (['N', 'AW'].indexOf(pdict.result.AVSResponseCode.toString()) > -1) {
                            ISML.renderTemplate('ErrorXML', {
                                ErrorCode: '130',
                                ErrorMsg: 'Invalid Billing Address'
                            });
                        } else if (['ND01', 'ND02', '081'].indexOf(pdict.result.AuthorizationResponseCode.toString()) > -1) {
                            ISML.renderTemplate('ErrorXML', {
                                ErrorCode: '140',
                                ErrorMsg: 'Payment Decline'
                            });
                        } else {
                            ISML.renderTemplate('ErrorXML', {
                                ErrorCode: '999',
                                ErrorMsg: 'A technical error occurred while creating the order.'
                            });
                            log.error('Order Groove create order failed due to : Radial Auth failed');
                        }
                        return;
                    }
                }
            }


            order.setConfirmationStatus(Order.CONFIRMATION_STATUS_CONFIRMED);
            order.setExportStatus(Order.EXPORT_STATUS_READY);

            //radial Order Export
            if(enableOGRefactor){
                createRadialOrder(order)
            }else{
                Pipeline.execute('Radial-OrderExport', {
                    Order: order
                });
            }


            // Render Successful XML response
            ISML.renderTemplate('SuccessXML', {
                OrderNo: order.getOrderNo()
            });
            return;

        });
    } catch (e) {
        Logger.getLogger('ordergroove', 'OG').error(e + '\n' + ' Failed to place order' + '\n' + xml);
    }
};

function getProductsString(basket) {
    try {
        return basket.productLineItems.toArray().map(e => { return e.productID + " : " + e.quantityValue.toString() }).join(',');
    }
    catch (e) {
        return e
    }
}

exports.PurchasePostTracking = function () {
    /* Local API Includes */
    var BasketMgr = require('dw/order/BasketMgr');
    var Site = require('dw/system/Site');
    var Transaction = require('dw/system/Transaction');

    if (request.getHttpMethod() !== 'POST') {
        // switching is not possible, set status 403 (forbidden)
        response.setStatus(403);
        return;
    }

    if (Site.getCurrent().getCustomPreferenceValue('OrderGrooveLegacyOffer') === null || Site.getCurrent().getCustomPreferenceValue('OrderGrooveLegacyOffer') === true) {
        ISML.renderTemplate('printer', {
            Message: 'Legacy offers enabled'
        });
        return;
    }

    var parameters = request.getHttpParameterMap();
    var tracking = parameters.get('tracking');

    var basket = BasketMgr.getCurrentOrNewBasket();
    Transaction.wrap(function () {
        basket.custom.subscriptionOptins = tracking;
    });
    ISML.renderTemplate('printer', {
        Message: basket.custom.subscriptionOptins
    });
    return;
};

/* Web exposed methods */
exports.Auth.public = true;
exports.AuthIframe.public = true;
exports.MSI.public = true;
exports.OrderPlacement.public = true;
exports.PurchasePostTracking.public = true;
