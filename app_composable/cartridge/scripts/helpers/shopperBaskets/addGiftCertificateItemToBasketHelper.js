'use strict';
/**
 * @namespace GiftCertificate
 */
const Site = require('dw/system/Site').getCurrent();
const Resource = require('dw/web/Resource');
importPackage(dw.web);
const InvService = require('app_composable/cartridge/scripts/helpers/integrations/inventory/ExternalInventory.js');
const errorHandler = require('app_composable/cartridge/scripts/helpers/util/errorHandler.js').errorHandler;
const imageryUtil	= require('int_dis/cartridge/scripts/utils/ImageryUtil.ds');

/**
 * Checks if the inputed form matches bbw requirments for GC
 * @function inputIsValid
 * @memberof GiftCertificate
 * @param {GiftCertificateItem} item : gift cer request object
 * @param {Product} product : the sfcc product Object associated with the GC
 * @return true if valid otherwise false
 */
function inputIsValid(item, product) {
    let valid = true;
    if (!(Site.getCustomPreferenceValue("giftCardPriceValues").indexOf(String(item.amount)) > -1)) {
        valid = false;
        request.custom.error = errorHandler.getErrorMessage('GIFTCERTIFICATE-04-001');
    }

    if (empty(item.c_productID)) {
        valid = false;
        request.custom.error = errorHandler.getErrorMessage('GIFTCERTIFICATE-04-002');
    }
    else {
        if (empty(product) || empty(product.custom.isGiftCard) || !product.custom.isGiftCard) {
            valid = false;
            request.custom.error = errorHandler.getErrorMessage('GIFTCERTIFICATE-04-003');
        }
    }

    if (empty(item.recipientName)) {
        valid = false;
        request.custom.error = errorHandler.getErrorMessage('GIFTCERTIFICATE-04-004');
    }
    if (empty(item.senderName)) {
        valid = false;
        request.custom.error = errorHandler.getErrorMessage('GIFTCERTIFICATE-04-005');
    }
    return valid;
}

/**
 * Checks if physical gift cards are in stock via radial
 * @function checkInv
 * @memberof GiftCertificate
 * @param {product} product : the SFCC product
 * @param {basket} basket : The basket object
 * @return true if valid otherwise false
 */
function checkInv(basket: dw.order.Basket, product) {
    let hasInv = true;
    if ('checkInventoryForPGC' in dw.system.Site.getCurrent().getPreferences().getCustom()
        && dw.system.Site.getCurrent().getCustomPreferenceValue('checkInventoryForPGC')
        && !product.custom.isVirtual) {
        let quantities = InvService.getInventoryForProducts([product.ID], []);
        let gcCountInBasket = basket.getGiftCertificateLineItems().toArray().filter(gcli => gcli.giftCertificateID == product.ID).length;
        let invEntry = quantities.find(e => e.productId === product.ID);
        hasInv = gcCountInBasket <= invEntry.qty;
        if (!hasInv) {
            request.custom.error = errorHandler.getErrorMessage('GIFTCERTIFICATE-04-006');
        }
    }
    return hasInv;
}

/**
 * Helper method, used to get gift card image (we will improve this logic when get real data)
 * @function getGCImageUrl
 * @memberof GiftCertificate
 * @param {dw.catalog.Product} product : Product || ProductVariationAttributeValue
 * @param {String} type : String ('large' || 'medium' || 'small' || 'swatch')
 * @returns {imageUrl} : String
 */
function getGCImageUrl(product, type) {
    let imageProduct;
    if (product instanceof dw.catalog.ProductVariationAttributeValue) {
        imageProduct = product;
    } else {
        if (product.variant && !empty(product.getVariationModel())) {
            imageProduct = product.getVariationModel();
        } else {
            imageProduct = product;
        }
    }

    var image = imageryUtil.getImagery(imageProduct, 'hires').getImage(type, 0),
        imageUrl = dw.web.URLUtils.staticURL('/images/noimage' + type + '.png');
    if (!empty(image)) {
        var imageUrl = image.url;
    }
    return imageUrl;
}


module.exports = {
    inputIsValid,
    checkInv,
    getGCImageUrl
}
