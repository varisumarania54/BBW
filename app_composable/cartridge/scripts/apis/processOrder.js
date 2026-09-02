'use strict'

/**
 * @namespace ProcessOrder
 */
const orderMgr = require('dw/order/OrderMgr');
const createOrderHelper = require('app_composable/cartridge/scripts/helpers/shopperOrders/createOrderHelper.js');
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;
const Site = require('dw/system/Site').getCurrent();
const Order = require('dw/order/Order');
const SubscriptionHelper = require('app_composable/cartridge/scripts/helpers/subscription/SubscriptionHelper.js');
const MailHelper = require('app_composable/cartridge/scripts/helpers/mail/mailHelper.js');
const Resource = require('dw/web/Resource');
const OrderGroove = require('int_ordergroove/cartridge/scripts/purchasePost.js');
const OGHelper = require('int_ordergroove/cartridge/scripts/customOrderGroove.js').OrdergrooveHelper;
const SMSHelper = require('app_composable/cartridge/scripts/helpers/integrations/SMS/signUp.js');


/**
 * Ensures the person requesting the order to be processed is also the person who placed it and the order is in a state to be processed
 * @function validateAndGetOrder
 * @memberof ProcessOrder
 * @param {string} orderId - id of the order
 * @param {string} orderToken - token that was supplied apon order creation.
 * @return {Order|null} - The order matching that order id and token if applicable
 */
function validateAndGetOrder(orderId, orderToken) {
    let order = orderMgr.getOrder(orderId, orderToken);
    if (empty(order) || order.exportStatus.value !== Order.EXPORT_STATUS_READY || order.getCustomer().ID !== customer.ID) {
        return null;
    }
    return order;
}

/**
 * Process and attempt to export an order.
 * @function proccessOrder
 * @memberof ProcessOrder
 * @param {Order} order - id of the order
 */
function proccessOrder(order) {
    //Order limits
    try {
        createOrderHelper.handleBopisOrderLimits(order);
    }
    catch (e) {
        logHandler.logger.error(e, 'Custom', 'OrderProc');
    }
    //Subscription Sign up
    try {
        SubscriptionHelper.addSubscriberCheckout(order);
    }
    catch (e) {
        logHandler.logger.error(e, 'Custom', 'OrderProc');
    }

    //Email conf
    try {
        //Email
        //Has ISPU
        let orderPrefix = !empty(Site.getCustomPreferenceValue('BBWOrderNumberPrefix')) ? Site.getCustomPreferenceValue('BBWOrderNumberPrefix') : '' ;
        let OrderNo = (!empty(orderPrefix)) ? orderPrefix + order.orderNo.toString() : order.orderNo;
        if (order.getShipments().toArray().some(e => !empty(e.custom.fromStoreId))) {
            if (Site.getCustomPreferenceValue('SendSFCCBopisOrderConfirmationEmail')) {
                MailHelper.setRequestLocale();
                const mixedBag = order.getShipments().length > 1;
                let subjectline = Resource.msg('order.bopis.confirm.subject', 'mail', null);
                let subject_bopis_only = dw.content.ContentMgr.getContent('bopis_email_subject');
                let subject_bopis_mixed = dw.content.ContentMgr.getContent('bopis_ship_mix_email_subject');
                if (mixedBag && subject_bopis_mixed != null && !empty(subject_bopis_mixed.custom.body)) {
                    subjectline = subject_bopis_mixed.custom.body.markup;
                } else if (subject_bopis_only != null && !empty(subject_bopis_only.custom.body)) {
                    subjectline = subject_bopis_only.custom.body.markup;
                }
                MailHelper.sendMailwRender('bopisorderconfirmation', order.customerEmail,
                    {
                        subject: subjectline + " " + OrderNo,
                        Order: order,
                    }
                )
            }
        }
        //Has No ISPU
        else {
            if (Site.getCustomPreferenceValue('SendSFCCOrderConfirmationEmail')) {
                MailHelper.setRequestLocale();
                MailHelper.sendMailwRender('orderconfirmation', order.customerEmail,
                    {
                        subject: Resource.msgf('order.confirm.subject', 'mail', null, OrderNo),
                        Order: order,
                    }
                )
            }
        }
    }
    catch (e) {
        logHandler.logger.error(e, 'Custom', 'OrderProc');
    }

    //OgOrder Post
    try {
        if (Site.getCustomPreferenceValue('OrderGrooveEnable') && OGHelper.isArSubscriptionItem(order)) {
            OrderGroove.orderNo(order.orderNo, false);
        }
    }
    catch (e) {
        logHandler.logger.error(e, 'Custom', 'OrderProc');
    }

    //SMS
    try {
        if (!empty(Site.getCustomPreferenceValue('enableBopisSMSSignup')) && Site.getCustomPreferenceValue('enableBopisSMSSignup')
            && order.getShipments().toArray().some(e => !empty(e.custom.smsOptIn) && e.custom.smsOptIn)) {
            SMSHelper.SMSService(order);
        }
    }
    catch (e) {
        logHandler.logger.error(e, 'Custom', 'OrderProc');
    }

    try {
        createOrderHelper.exportOrder(order);
    }
    catch (e) {
        logHandler.logger.error(e, 'Custom', 'OrderProc');
    }
    return { OK: true, message: "OK" }
}




module.exports = {
    proccessOrder,
    validateAndGetOrder
}

