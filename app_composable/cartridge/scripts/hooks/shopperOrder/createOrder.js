'use strict';
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;
const Status = require('dw/system/Status');
const createOrderHelper = require('app_composable/cartridge/scripts/helpers/shopperOrders/createOrderHelper.js');
const validate = require('app_composable/cartridge/scripts/helpers/objects/basket.js');
const bopisHelper = require('app_composable/cartridge/scripts/helpers/objects/BasketComponents/BopisHelper.js');
const basketHelper = require('app_composable/cartridge/scripts/helpers/objects/basket.js');
const Resource = require('dw/web/Resource');
const FEAloudMessages = [Resource.msg('items.unavailable', 'cart', null), Resource.msg('invalidcreditcard', 'billing', null), Resource.msg('items.allocationUnavailable', 'cart', null)];
const AllocationHelper = require('int_radial_composable/cartridge/scripts/rom/inventory/allocateInventoryHelper.js');
const orderMgr = require('dw/order/OrderMgr');
const Order = require('dw/order/Order');
const preValidateOnOrder = require('app_composable/cartridge/scripts/helpers/shopperOrders/validateBasketForOrder.js');
const MailHelper = require('app_composable/cartridge/scripts/helpers/mail/mailHelper.js');
const Site = require('dw/system/Site').getCurrent();
const ProductInventoryMgr = require('dw/catalog/ProductInventoryMgr');

/**
 *
 * @param {dw.order.Basket} basket
 * @returns {dw.system.Status}
 */
exports.beforePOST = function (basket) {
    const requestBody = JSON.parse(request.httpParameterMap.requestBodyAsString);
    request.custom.swappedInv = false;
    //VALIDATION
    try {
        // set the correct locale
        MailHelper.setRequestLocale();
        let validation = validate.validate(basket);
        if (!empty(validation) && !validation.EnableCheckout) {
            let message = '';
            //REFACTOR
            if(validation.BasketStatus.getCode() == "BASKETLIMIT"){
                const data = JSON.parse(validation.BasketStatus.getMessage());
                message = data.message;
            }
            let SFCCDescriptiveMessageError = preValidateOnOrder.validateBasketForOrderCreate(basket, requestBody);
            if (!empty(SFCCDescriptiveMessageError)) {
                return new Status(Status.ERROR, '400', SFCCDescriptiveMessageError);
            }
            return new Status(Status.ERROR, '400', preValidateOnOrder.buildJsonError("cart", message));
        }
        request.custom.categoryString = basketHelper.getCategorizationString(basket);
        request.custom.ismobile = !empty(requestBody.c_platform) && requestBody.c_platform == 'mobile';
        const SFCCValidationError = preValidateOnOrder.validateBasketForOrderCreate(basket, requestBody);
        if (!empty(SFCCValidationError)) {
            return new Status(Status.ERROR, '400', SFCCValidationError);
        }
        if (session.userAuthenticated && basketHelper.basketContainsARItems(basket)) {
            return new Status(Status.ERROR, '400', 'Bad Request');
        }

        if (bopisHelper.validateBopisAvailability(basket)) {
            return new Status(Status.ERROR, '400', 'Bopis Store Unavailable');
        }
    } catch (e) {
        logHandler.logger.error(e, 'Hooks', 'beforePostOrder');
        return new Status(Status.ERROR);
    }
    request.custom.orderNumber = orderMgr.createOrderSequenceNo();
    request.custom.SessionStartTime = basket.custom.RadialCustomerVisitTimeStart;
    request.custom.c_LineItemUUIDS = JSON.stringify(basket.productLineItems.toArray().map(e => { return { productID: e.productID, shipmentID: e.shipment.ID, UUID: e.UUID } }));
    request.custom.c_RDFUID = !empty(requestBody.c_RDFUID) ? requestBody.c_RDFUID : '';
    //ALLOCATION AND AUTH
    try {
        // Reserve inventory for the order
        createOrderHelper.reserveInventory(basket);
        // Handle payment authorizations
        createOrderHelper.handlePaymentAuth(basket, request.custom.orderNumber);
        // If the user opted to save the payment instrument to their wallet
        if (requestBody.c_saveToInstruments && customer && customer.getProfile()) {
            try {
                // Save the payment instrument to the customer's wallet
                createOrderHelper.saveCardToCustomerWallet(basket, customer);
            } catch (e) {
                // Log any errors encountered during address saving process
                logHandler.logger.info(e, 'CustomAPI', 'SavePaymentInstrument');
            }
        }
        //Moved basket changes to after service calls for better efficiency
        basket.custom.radialRDFUID = !empty(requestBody.c_RDFUID) ? requestBody.c_RDFUID : '';
        createOrderHelper.handleEGCOnlyShipments(basket);
    } catch (e) {
        // Rollback inventory if there was an error
        AllocationHelper.RollbackOrder(basket);
        if (!FEAloudMessages.some(i => e.message.indexOf(i) != -1)) {
            logHandler.logger.error(e, 'Hooks', 'beforePostOrder');
            return new Status(Status.ERROR);
        } else {
            return new Status(Status.ERROR, '400', e.message);
        }
    }
    if (Site.getCustomPreferenceValue('perpetualInvOn')) {
        //Swap prep
        const perpetualListId = Site.getCustomPreferenceValue('perpetualInventoryListID');
        const perpCategoryNames = Site.getCustomPreferenceValue('perpCategoryNames');
        //Add on an off switch
        if (!empty(perpetualListId) && !empty(perpCategoryNames) && !empty(Site.getCustomPreferenceValue('perpetualInvListIds'))) {
            const inventoryList = ProductInventoryMgr.getInventoryList(perpetualListId);
            if (inventoryList) {
                createOrderHelper.swapInvLists(inventoryList, basket, perpCategoryNames);
            }
        }
    }
};

/**
 * Hook called after the order is created.
 * @param {dw.order.Order} order - The current order
 * @returns {dw.system.Status} - OK if successful OR error on code issues
 */
exports.afterPOST = function (order) {
    const requestBody = JSON.parse(request.httpParameterMap.requestBodyAsString);
    try {
        order.custom.RadialCustomerVisitTime = (Date.now() - request.custom.SessionStartTime).toFixed(0);
        order.custom.RadialCCAttempts = (new Number(order.custom.RadialCCAuthAttempts)).toFixed(0);
        createOrderHelper.handleOrderContext(order, requestBody);
        order.custom.RadialDeviceFingerprintID = !empty(requestBody.c_RDFUID) ? requestBody.c_RDFUID : '';
        order.custom.platform = request.custom.ismobile ? 'NATIVEAPP' : 'MRT';
        order.custom.orderType = request.custom.categoryString;
        order.custom.modifiedByPerpRules = request.custom.swappedInv;
        orderMgr.placeOrder(order);
        order.setExportStatus(Order.EXPORT_STATUS_READY);
        order.setConfirmationStatus(Order.CONFIRMATION_STATUS_CONFIRMED);
    } catch (e) {
        logHandler.logger.failOrderAddLogInformation(order, 'ORDER_PLACEMENT_ERROR');

        logHandler.logger.error(e, 'Hooks', 'afterPostOrder');
    }
};

/**
 *
 * @param {dw.order.Order} order
 * @param orderResponse
 * @returns {dw.system.Status}
 */
exports.modifyPOSTResponse = function (order, orderResponse) {
    try {
        createOrderHelper.handleModify(order, orderResponse);
    } catch (e) {
        logHandler.logger.error(e, 'Hooks', 'modifyPOSTResponse');
        return new Status(Status.ERROR);
    }
};

exports.createOrderNo = function () {
    return request.custom.orderNumber;
};
