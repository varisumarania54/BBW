'use strict';

/**
 * OrderGroove Write Feed
 * Used to send a product feed to the OrderGroove SFTP location.
 */

/* API Includes */
var Logger = require('dw/system/Logger');
var File = require('dw/io/File');
var Site = require('dw/system/Site');
var FileWriter = require('dw/io/FileWriter');
var XMLIndentingStreamWriter = require('dw/io/XMLIndentingStreamWriter');
var Status = require('dw/system/Status');
var LocalServiceRegistry = require('dw/svc/LocalServiceRegistry');
var ProductMgr = require('dw/catalog/ProductMgr');
var Pipeline = require('dw/system/Pipeline');


/**
 * Service function to upload file to the SFTP location
 * @param {string} filePath - the local file path where the file will be placed
 * @param {string} remoteName - the remote name of the file to be uploaded
 * @returns {Object} The result of the service call
 */
function uploadFeed(filePath, remoteName) {
    var localFile = new File(filePath);
    var service = LocalServiceRegistry.createService('OrderGroove.UploadFeed', {
        createRequest: function (svc) {
            svc.setAutoDisconnect(true);
            var remotePath = '/incoming/' + Site.getCurrent().getCustomPreferenceValue('OrderGrooveMerchantID') + '.' + remoteName + '.xml';
            svc.setOperation('putBinary', remotePath, localFile);
        },
        parseResponse: function (svc, response) {
            return response;
        },
        filterLogMessage: function (msg) {
            return msg;
        }
    });
    var result = service.call();
    return result;
}

/**
 * Job process function
 * @returns {Object} The resulting status
 */
function writeProducts() {
    var log = Logger.getLogger('ordergroove', 'OG');
    const productHelper = require('app_composable/cartridge/scripts/helpers/objects/product.js');
    try {
        var priceBookID = Site.getCurrent().getCustomPreferenceValue('OrderGroovePriceBookID');
        var viewType = Site.getCurrent().getCustomPreferenceValue('OrderGrooveImageViewType');
        var dir = new File(File.IMPEX + File.SEPARATOR + 'src' + File.SEPARATOR + 'catalog-feeds');
        if (!dir.isDirectory()) {
            dir.mkdir();
        }
        var output = Site.getCurrent().getCustomPreferenceValue('OrderGrooveMerchantID') + '.Products.xml';
        var file = new File(dir, output);
        var products = ProductMgr.queryAllSiteProductsSorted();
        var writer = new FileWriter(file);
        var xisw = new XMLIndentingStreamWriter(writer);
        xisw.setIndent('\t');
        xisw.writeStartElement('products');
        var errorProductsForEmail = [];
        var errorProductsForLog = [];
        while (products.hasNext()) {
            var product = products.next();
            if (product !== null && product.isOnline() && !product.isMaster()) {

                var productName = product.getName();
                var productID = product.getID();
                var salePrice = product.getPriceModel().getPriceBookPrice(priceBookID).getValue().toFixed(2);
                var productURL = productHelper.getProductPageUrlWithoutHtml(product.getID());
                var imageURL = viewType !== null && product.getImage(viewType) !== null ? product.getImage(viewType).getHttpsURL().toString() : '';
                var inStock = product.getAvailabilityModel().isInStock() ? '1' : '0';
                var isAutoRefreshEligible = product.getCustom().autoRefresh && product.getCustom().autoRefresh === true ? '1' : '0';

                if (productName == null || productID == null || salePrice == null || productURL == null || imageURL == null || inStock == null) {
                    errorProductsForEmail.push("Product id : " + product.ID);
                    errorProductsForLog.push("Product id : " + product.ID + "(null data)");
                }
                else {
                    xisw.writeStartElement('product');
                    xisw.writeStartElement('name');
                    xisw.writeCData(productName);
                    xisw.writeEndElement();
                    xisw.writeStartElement('product_id');
                    xisw.writeCharacters(productID);
                    xisw.writeEndElement();
                    xisw.writeStartElement('sku');
                    xisw.writeCharacters(productID);
                    xisw.writeEndElement();
                    xisw.writeStartElement('price');
                    xisw.writeCharacters(salePrice);
                    xisw.writeEndElement();
                    xisw.writeStartElement('details_url');
                    xisw.writeCharacters(productURL);
                    xisw.writeEndElement();
                    xisw.writeStartElement('image_url');
                    xisw.writeCharacters(imageURL);
                    xisw.writeEndElement();
                    xisw.writeStartElement('in_stock');
                    xisw.writeCharacters(inStock);
                    xisw.writeEndElement();
                    xisw.writeStartElement('autoship_eligible');
                    xisw.writeCharacters(isAutoRefreshEligible);
                    xisw.writeEndElement();
                    xisw.writeEndElement();
                }
            }
        }
        xisw.writeEndElement();
        xisw.flush();
        xisw.close();
        writer.flush();
        writer.close();
        var exportPath = file.getFullPath();
        var result = uploadFeed(exportPath, 'Products');
        if (errorProductsForEmail.length > 0) {
            var productLog = Logger.getLogger('ErroredProducts', 'Ordergroove');
            var error = errorProductsForLog.join("\n");
            productLog.error(error.toString());
            if (!empty(arguments[0].FailedProductsEmail)) {
                var pdict = Pipeline.execute('Mail-Send', {
                    MailFrom: "donotreply@bbw.com",
                    MailSubject: 'Invalid products identified while creating Ordergroove feed',
                    MailTo: arguments[0].FailedProductsEmail,
                    MailTemplate: 'mail/Failed-Products-Email',
                    Head: errorProductsForEmail.length + " products failed to export from the product catalog",
                    Products: errorProductsForEmail
                });
            }
        }
        if (result.isOk() === false) {
            return new Status(Status.ERROR, 'ERROR', result.getErrorMessage());
        }
        return new Status(Status.OK);
    } catch (e) {
        var error = e;
        log.error(error.toString());
        return new Status(Status.ERROR, 'ERROR', error.toString());
    }
}

/* Module export for the job */
module.exports = {
    writeProductFeed: writeProducts
};
