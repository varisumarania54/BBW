'use strict';

const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;
const Status = require('dw/system/Status');
const createOrderHelper = require('app_composable/cartridge/scripts/helpers/shopperOrders/createOrderHelper.js');

/**
 * Hook - dw.ocapi.shop.order.modifyGETResponse
 *
 * @param {dw.order.Order} order - target order
 * @param orderResponse - order response object
 * @returns {dw.system.Status}
 */
exports.modifyGETResponse = function (order, orderResponse) {
    try {
        createOrderHelper.handleModify(order, orderResponse);
    } catch (e) {
        logHandler.logger.error(e, 'Hooks', 'modifyGETResponse');

        return new Status(Status.ERROR);
    }
}

