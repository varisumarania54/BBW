'use strict';

const FileWriter = require('dw/io/FileWriter');
const XMLStreamWriter = require('dw/io/XMLStreamWriter');
const File = require('dw/io/File')
const Site = require('dw/system/Site').getCurrent();
const externalInvHelper = require('app_composable/cartridge/scripts/helpers/integrations/inventory/ExternalInventory.js');

/**
 * Builds an inventory record XML element.'
 * @function buildInvRecord
 * @param {Object} xmlWriter - The XML writer object.
 * @param {Object} value - The value object containing product details.
 * @param {string} value.productId - The product ID.
 * @param {number} value.qty - The quantity.
 */
function buildInvRecord(xmlWriter, value) {
    let currentDate = new Date();
    let isoString = currentDate.toISOString();
    xmlWriter.writeStartElement('record');
    xmlWriter.writeAttribute('product-id', value.productId);
    writeOneLineXML(xmlWriter, 'allocation', value.qty);
    writeOneLineXML(xmlWriter, 'allocation-timestamp', isoString);
    writeOneLineXML(xmlWriter, 'perpetual', 'false');
    writeOneLineXML(xmlWriter, 'preorder-backorder-handling', 'none');
    writeOneLineXML(xmlWriter, 'preorder-backorder-allocation', '0');
    writeOneLineXML(xmlWriter, 'ats', value.qty);
    writeOneLineXML(xmlWriter, 'on-order', '0');
    writeOneLineXML(xmlWriter, 'turnover', '0');
    xmlWriter.writeEndElement();
}

/**
 * Builds an inventory header XML element.
 * @function buildInvHeader
 * @param {Object} xmlWriter - The XML writer object.
 * @param {string} id - The list ID.
 */
function buildInvHeader(xmlWriter, id) {
    xmlWriter.writeStartElement('header');
    xmlWriter.writeAttribute('list-id', id);
    writeOneLineXML(xmlWriter, 'default-instock', 'false');
    writeOneLineXML(xmlWriter, 'description', 'Inventory for BB2NA');
    writeOneLineXML(xmlWriter, 'use-bundle-inventory-only', 'false');
    writeOneLineXML(xmlWriter, 'on-order', 'false');
    xmlWriter.writeEndElement();
}

/**
 * Writes a single line XML element.
 * @function writeOneLineXML
 * @param {Object} xmlWriter - The XML writer object.
 * @param {string} tag - The XML tag name.
 * @param {string} value - The value to write inside the XML element.
 */
function writeOneLineXML(xmlWriter, tag, value) {
    xmlWriter.writeStartElement(tag);
    xmlWriter.writeCharacters(value);
    xmlWriter.writeEndElement();
}

/**
 * Builds an inventory list XML element.
 * @function buildInvList
 * @param {Object} xmlWriter - The XML writer object.
 * @param {string} id - The list ID.
 * @param {Array} values - The array of value objects containing product details.
 */
function buildInvList(xmlWriter, id, values) {
    xmlWriter.writeStartElement('inventory-list');
    buildInvHeader(xmlWriter, id);
    xmlWriter.writeStartElement('records');
    values.forEach(valueObj => {
        buildInvRecord(xmlWriter, valueObj);
    });
    xmlWriter.writeEndElement();
    xmlWriter.writeEndElement();
}

/**
 * Generates a file-safe date-time string.
 * @function getFileSafeDateTime
 * @returns {string} The file-safe date-time string.
 */
function getFileSafeDateTime() {
    let currentDate = new Date();
    let dateTimeString = currentDate.toISOString()
        .replace(/:/g, '-')  // Replace colons with hyphens
        .replace(/\./g, '-') // Replace dots with hyphens
        .replace(/Z/g, '');  // Remove the 'Z' at the end

    return dateTimeString;
}

/**
 * Creates a new file in the specified directory.
 * @function getFile
 * @returns {Object} The file object.
 */
function getFile() {
    const dir = new File(File.IMPEX + File.SEPARATOR + 'src' + File.SEPARATOR + 'perpetualInvSync');
    if (!dir.isDirectory()) {
        dir.mkdir();
    }
    const file = new File(dir, getFileSafeDateTime() + '.xml');
    if (file.exists()) {
        file.remove();
    }
    file.createNewFile();
    return file;
}

/**
 * Main function to build and write inventory XML.
 * @function main
 * @param {Object} params - The parameters object.
 * @param {number} params.batchSize - The batch size for processing products.
 */
function main(params) {
    if (Site.getCustomPreferenceValue('perpetualInvOn')) {
        const invListIds = Site.getCustomPreferenceValue('perpetualInvListIds').split(',');
        const categories = Site.getCustomPreferenceValue('perpCategoryNames');
        if (!empty(categories) && !empty(params.batchSize)) {
            const categoryArray = categories.split(',');
            let productSearchHits = [];
            categoryArray.forEach(category => {
                const searchModel = new dw.catalog.ProductSearchModel();
                searchModel.setCategoryID(category);
                searchModel.setRecursiveCategorySearch(false);
                const result = searchModel.search();
                if (result.statusCode == dw.system.SearchStatus.SUCCESSFUL || result.statusCode == dw.system.SearchStatus.LIMITED) {
                    searchModel.getProductSearchHits().asList().toArray().forEach(hit => {
                        if(!productSearchHits.includes(hit.productID)){
                            productSearchHits.push(hit.productID);
                        }
                    })
                }
            });
            if (!empty(productSearchHits)) {
                const invMap = {};
                invListIds.forEach(id => {
                    invMap[id] = [];
                });
                for (let i = 0; i < productSearchHits.length; i += params.batchSize) {
                    let batch = productSearchHits.slice(i, i + params.batchSize);
                    //WorkShop
                    let radialResponse = externalInvHelper.getInventoryForProductsBasedOnInvIds(batch, invListIds);
                    radialResponse.forEach(responseObj => {
                        let id = responseObj.lineId.split('_')[1];
                        invMap[id].push({ productId: responseObj.productId, qty: responseObj.qty });
                    });
                }
                const fileWriter = new FileWriter(getFile(), "UTF-8");
                const xmlWriter = new XMLStreamWriter(fileWriter);
                xmlWriter.writeStartDocument();
                xmlWriter.writeStartElement("inventory");
                xmlWriter.writeAttribute("xmlns", "http://www.demandware.com/xml/impex/inventory/2007-05-31");
                for (let key in invMap) {
                    buildInvList(xmlWriter, key, invMap[key]);
                }
                xmlWriter.writeEndElement();
                xmlWriter.writeEndDocument();
                xmlWriter.close();
                fileWriter.close();
            }
        }
    }
}

module.exports = {
    main
}
