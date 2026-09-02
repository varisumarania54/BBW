'use strict';
var Status = require("dw/system/Status");
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;

/**
 *
 * @param {*} customer
 * @param {*} customerProductListResultResponse
 * @returns
 */
exports.modifyGETResponse_v2 = function (customer: dw.customer.Customer, customerProductListResultResponse: CustomerProductListResult) {
    try {
        if (!empty(customer) && !empty(customerProductListResultResponse)) {
            // get product lists of type wishlist
            const customerProductLists = customer.getProductLists(dw.customer.ProductList.TYPE_WISH_LIST).toArray();
            if (!empty(customerProductLists)) {
                // iterate over response to add creation date of items
                if (customerProductListResultResponse.data && !empty(customerProductListResultResponse.data)) {
                    customerProductListResultResponse.data.toArray().forEach(list => {
                        if (!empty(list.type) && list.type === 'wish_list') {
                            // check if list is in customer product lists
                            const listInCustProdLists = customerProductLists.find(li => li.ID === list.id);
                            if (!empty(listInCustProdLists)) {
                                // get items from product list
                                let itemsInResponse = list.customerProductListItems.toArray();
                                list.customerProductListItems = itemsInResponse;
                            }
                        }
                    })
                }

            }
        }
        return new Status(Status.OK);
    }
    catch (e) {
        logHandler.logger.error(e, 'Hooks', 'getProductLists');
        return new Status(Status.ERROR);
    }
}
