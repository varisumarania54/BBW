'use strict';
const radialHelper = require('int_radial_composable/cartridge/scripts/helpers/RadialHelper.js');
const orderHistoryHelper = require('app_composable/cartridge/scripts/helpers/orderHistory/orderHistoryHelper.js');
const validationsUtil = require('app_composable/cartridge/scripts/helpers/util/validationsUtil.js');
const recaptcha = require('app_composable/cartridge/scripts/helpers/recaptcha/recaptchaValidation.js');
const errorHandler = require('app_composable/cartridge/scripts/helpers/util/errorHandler.js').errorHandler;
const Site = require('dw/system/Site').getCurrent();
const { isValidUUID } = require('app_composable/cartridge/scripts/helpers/validation/validateUUID');

/**
 * Requests order history from OMS and models the data into an Array
 * @returns {Array} Returns array of orders
 */
exports.getOrderHistory = function () {
    if (!customer.isRegistered() && !customer.isAuthenticated()) {
        throw new errorHandler.error('ORDER-HISTORY-04-001');
    }
    let customerNumber = customer.getProfile().getCustomerNo();
    let customerNumberPrefix = Site.getCustomPreferenceValue('BBWCustomerNumberPrefix') || '';
    customerNumber = isValidUUID(customerNumber) ? customerNumber : customerNumberPrefix.concat(customerNumber);
    let orderHistoryXML = radialHelper.getRadialOrderHistory(customerNumber);
    if (empty(orderHistoryXML)) {
        throw new errorHandler.error('ORDER-HISTORY-04-002');
    }

    return orderHistoryHelper.orderHistoryModel(customerNumber, orderHistoryXML);
}

/**
 * Gets order details from radial then validates ownership before forming the api response
 * @param {String} orderNo - API parameters for ownership validation
 * @param {String} email - API parameters for ownership validation
 * @param {String} postalCode - API parameters for ownership validation
 * @returns {Object} Returns order object or empty object if not found or valid
 */
exports.getOrderDetails = function (orderNo, email, postalCode) {
    // Guest order tracking pre-service call validation
    let isGuestOrderTracking = !customer.isRegistered() && !customer.isAuthenticated();
    if (isGuestOrderTracking) {
        validationsUtil.validateRequest({ email, postalCode }, 'Customer-Attributes');
        let validationError = recaptcha.validateToken(recaptcha.ACCOUNT, recaptcha.ORDER_DETAILS);
        if (validationError) {
            throw validationError;
        }
        if (empty(email)) {
            throw new errorHandler.error('ORDER-DETAILS-04-001');
        }
        if (empty(postalCode)) {
            throw new errorHandler.error('ORDER-DETAILS-04-002');
        }
    }

    // Fetch order XML from radial service
    let orderXML = radialHelper.getRadialOrder(orderNo);
    if (empty(orderXML)) {
        throw new errorHandler.error('ORDER-DETAILS-04-003', orderNo);
    }

    // Order tracking post-service call validation
    let customerOrderId = orderXML.attribute('customerOrderId').toString();
    if (orderNo !== customerOrderId) {
        if (isGuestOrderTracking) {
            throw new errorHandler.error('ORDER-DETAILS-04-004');
        }
        throw new errorHandler.error('ORDER-DETAILS-04-005', `orderNo: ${orderNo} does not match ${customerOrderId}`);
    }

    // Order XML validation
    if (isGuestOrderTracking) {
        let validGuestOrder = orderHistoryHelper.validateGuestOrderTracking(orderXML, orderNo, email, postalCode);
        if(!validGuestOrder){
            throw new errorHandler.error('ORDER-DETAILS-04-004');
        }
    } else {
        let customerNo = customer.profile && customer.profile.customerNo;
        customerNo = isValidUUID(customerNo) ? customerNo : (Site.getCustomPreferenceValue('BBWCustomerNumberPrefix') || '').concat(customerNo);
        let {error, message} = orderHistoryHelper.validateCustomerOrder(orderXML, orderNo, customerNo);
        if (error) {
            throw new errorHandler.error('ORDER-DETAILS-04-005', message);
        }
    }

    let paymentMapping = radialHelper.paymentMapping;
    return orderHistoryHelper.orderDetailsModel(orderXML, paymentMapping);
}
