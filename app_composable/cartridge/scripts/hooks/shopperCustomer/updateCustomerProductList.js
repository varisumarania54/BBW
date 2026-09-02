/**
 * Hook customizations for setting list and all items to public true or false for sharing
 * @module updateCustomerProductlist
 */
'use strict';
const Status = require("dw/system/Status");
const ProductListMgr = require('dw/customer/ProductListMgr');
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;

/** EnableShareLoveItList site preference turns off fetching public wishlists
 * @param {dw.customer.Customer} customer - current customer
 * @param {CustomerProductList} productList - object of requested product list changes
 * @return {dw.system.Status} Ok if successful and error on code issues
 */
exports.afterPATCH = function (customer: dw.customer.Customer, productList: CustomerProductList) {
    try {
        const parameters = request.getSCAPIPathParameters();
        const listId = parameters.get('listId');
        const setPublic = productList.public;
        if (!empty(listId) && !empty(setPublic)) {
            const list = ProductListMgr.getProductList(listId);
            if (!empty(list)) {
                list.getProductItems().toArray().map(item => item.public = setPublic);
            }
        }
        return new Status(Status.OK);
    }
    catch (e) {
        logHandler.logger.error(e, 'Hooks', 'updateCustomerProductList');
        return new Status(Status.ERROR);
    }
}