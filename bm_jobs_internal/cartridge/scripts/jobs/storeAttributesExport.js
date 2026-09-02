'use strict';

const Status = require('dw/system/Status');
const Logger = require('dw/system/Logger');
const File = require('dw/io/File');
const FileReader = require('dw/io/FileReader');
const FileWriter = require('dw/io/FileWriter');
const XMLStreamReader = require('dw/io/XMLStreamReader');
const XMLStreamWriter = require('dw/io/XMLStreamWriter');
const XMLStreamConstants = require('dw/io/XMLStreamConstants');
const ArrayList = require('dw/util/ArrayList');
const StoreMgr = require('dw/catalog/StoreMgr');

const log = Logger.getLogger('storeAttributesExport', 'storeAttributesExport');

/**
 * Writes store attributes to an XML file in SFCC import format
 * @param {Array<string>} storeIds - Array of store IDs to export
 * @param {Object} params - Job parameters
 * @param {string} params.outputFilePrefix - Prefix for the output file name
 * @param {string} params.fileDirectory - Path relative to IMPEX folder
 */
function writeStoreAttributesToXML(storeIds, params) {
    let date = new Date().toISOString().replace(/-/g, '').split('T')[0];
    let fileName = params.outputFilePrefix.concat(`-${date}.xml`);
    let file = new File(File.IMPEX + File.SEPARATOR + params.fileDirectory + File.SEPARATOR + fileName);
    let fileWriter = new FileWriter(file, 'UTF-8');
    let xsw = new XMLStreamWriter(fileWriter);

    try {
        xsw.writeStartDocument();
        xsw.writeStartElement('stores');
        xsw.writeAttribute('xmlns', 'http://www.demandware.com/xml/impex/store/2007-04-30');
        for (let i = 0; i < storeIds.length; i++) {
            let store = StoreMgr.getStore(storeIds[i]);

            xsw.writeStartElement('store');
            xsw.writeAttribute('store-id', store.ID);

            if (store.custom.inventoryListId) {
                xsw.writeStartElement('inventory-list-id');
                xsw.writeCharacters(store.custom.inventoryListId);
                xsw.writeEndElement();
            }

        xsw.writeStartElement('custom-attributes');
        let customAttributes = store.custom;
        for (let ca in customAttributes) {
            xsw.writeStartElement('custom-attribute');
            xsw.writeAttribute('attribute-id', ca);
            if (typeof store.custom[ca] == 'object') {
                xsw.writeStartElement('value');
                for (let x in store.custom[ca]) {
                    xsw.writeCharacters(store.custom[ca][x].value);
                }
                xsw.writeEndElement();
            } else {
                xsw.writeStartElement('value');
                xsw.writeCharacters(store.custom[ca]);
                xsw.writeEndElement();
            }
            xsw.writeEndElement();
        }
        xsw.writeEndElement();
        xsw.writeEndElement();
    }
        xsw.writeEndElement();
        xsw.writeEndDocument();
    } finally {
        xsw.close();
        fileWriter.close();
    }

    log.info('Exported {0} stores to {1}', storeIds.length, fileName);
}

/**
 * Retrieves files from IMPEX folder matching the specified pattern
 * @param {string} fileLocation - Path relative to IMPEX folder
 * @param {string} filePattern - Regular expression pattern to match file names
 * @returns {dw.util.ArrayList} List of matching files
 */
function retrieveImpexFiles(fileLocation, filePattern) {
    let files = new File(File.IMPEX + File.SEPARATOR + fileLocation);
    let fileMatches = new ArrayList();
    let regexPattern = new RegExp(filePattern);

    fileMatches.addAll(files.listFiles(function (file) {
        return regexPattern.test(file.name);
    }));

    return fileMatches;
}

/**
 * Extracts store IDs from XML files by parsing store elements
 * @param {dw.util.ArrayList} files - List of XML files to parse
 * @returns {Array<string>} Array of store IDs found in the files
 */
function getStoresArray(files) {
    let stores = [];
    for (let i in files) {
        let fileReader = new FileReader(files[i], 'UTF-8');
        let xmlStreamReader = new XMLStreamReader(fileReader);
        try {
            if (xmlStreamReader.hasNext()) {
                if (xmlStreamReader.next() == XMLStreamConstants.START_ELEMENT && xmlStreamReader.getLocalName() == 'stores') {
                    while (xmlStreamReader.hasNext()) {
                        if (xmlStreamReader.next() == XMLStreamConstants.START_ELEMENT && xmlStreamReader.getLocalName() == 'store') {
                            let storeXML = xmlStreamReader.readXMLObject();
                            let storeID = storeXML.attribute('store-id').toString();
                            let store = StoreMgr.getStore(storeID);
                            if (!empty(store)) {
                                stores.push(storeID);
                            }
                        }
                    }
                }
            }
        } finally {
            xmlStreamReader.close();
            fileReader.close();
        }
    }
    return stores;
}

/**
 * Main job step function to export store attributes to XML
 * @param {Object} params - Job step parameters
 * @param {string} params.fileDirectory - Path relative to IMPEX folder for input/output files
 * @param {string} params.filePattern - Regex pattern to match input XML files
 * @param {string} params.outputFilePrefix - Prefix for output file name
 * @returns {dw.system.Status} Job execution status
 */
function storeAttributesExport(params) {
    try {
        log.info('Starting store attributes export from {0}', params.fileDirectory);
        
        let files = retrieveImpexFiles(params.fileDirectory, params.filePattern);
        log.info('Found {0} file(s) matching pattern: {1}', files.length, params.filePattern);
        
        let importStores = getStoresArray(files);
        log.info('Extracted {0} store(s) from input files', importStores.length);
        
        writeStoreAttributesToXML(importStores, params);
        
        return new Status(Status.OK, 'OK', 'Successfully exported ' + importStores.length + ' stores');

    } catch (e) {
        log.error('Error exporting store attributes: {0}', e.message + '\n' + e.stack);
        return new Status(Status.ERROR, 'ERROR', e.message);
    }
}

module.exports = {
    storeAttributesExport
};