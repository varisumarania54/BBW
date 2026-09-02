/**
 * Hook customizations for public wishlist
 * @module getPublicProductList
 */
'use strict';
const Site = require('dw/system/Site');
const Status = require("dw/system/Status");
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;

/** EnableShareLoveItList site preference turns off fetching public wishlists
 * @param {String} listId - product list id requested
 * @return {dw.system.Status} - Ok if preference is enabled and Error if disabled
 */
exports.beforeGET = function (listId : String) {
    try {
        const enableShareLoveItList = Site.getCurrent().getCustomPreferenceValue('EnableShareLoveItList');
        if (enableShareLoveItList) {
            return new Status(Status.OK);
        }
        return new Status(Status.ERROR, '403', 'Product list sharing is disabled');
    }
    catch (e) {
        logHandler.logger.error(e, 'Hooks', 'getPublicProductList:beforeGET');
        return new Status(Status.ERROR);
    }
}

/** Sets additional response attributes required for front-end
 * @param {dw.customer.ProductList} productList - requested product list
 * @param {PublicProductList} publicProductListResponse - response body
 * @return {dw.system.Status} - Ok if preference is enabled and Error if disabled
 */
exports.modifyGETResponse = function (productList : dw.customer.ProductList , publicProductListResponse : PublicProductList) {
    try {
        const listOwner = productList.getOwner();
        const profile = listOwner.getProfile();
        const publicProductItems = productList.getPublicItems().toArray();
        Object.assign(publicProductListResponse, {
            c_firstName: profile.getFirstName(),
            c_lastName: profile.getLastName(),
            c_selfOwnedWishList: listOwner.getID() === customer.getID()
        });
        publicProductListResponse.productListItems.toArray().map(item => {
            let productId = item.id;
            let product = publicProductItems.find(pli => {
                return pli.getID() === productId;
            });
            item.c_productId = product.getProductID();
            return item;
        })
        return new Status(Status.OK);
    }
    catch (e) {
        logHandler.logger.error(e, 'Hooks', 'getPublicProductList:modifyGETResponse');
        return new Status(Status.ERROR);
    }
}
