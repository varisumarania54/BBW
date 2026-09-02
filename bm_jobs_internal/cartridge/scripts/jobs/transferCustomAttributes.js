//'use strict';

/* Import necessary dependencies */
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;
const ProductMgr = require('dw/catalog/ProductMgr'); 
const ContentMgr = require('dw/content/ContentMgr'); 
const Status = require('dw/system/Status');
const FileWriter = require('dw/io/FileWriter');
const XMLStreamWriter = require('dw/io/XMLStreamWriter');
const File = require('dw/io/File');
var ContentSearchModel = require('dw/content/ContentSearchModel');

/**
 * Batch job to set sort prices in the product data c_sortPrice
 * @returns {Object} The resulting status
 */
function transferProductCustomAttributes(params){    
    try{
        let output;
        if (empty(params) || !params.FileName) {
            throw new Error('Missing filename in parameter')
        } else {
            output = params.FileName + '.xml';
        }

        let source;
        if (empty(params) || !params.SourceCustomAttribute) {
            throw new Error('Missing source custom attribute ID')
        } else {
            source = params.SourceCustomAttribute;
        }

        
        let target;
        if (empty(params) || !params.TargetCustomAttribute) {
            throw new Error('Missing target custom attribute ID')
        } else {
            target = params.TargetCustomAttribute;
        }


        var dir = new File(File.IMPEX + File.SEPARATOR + 'src' + File.SEPARATOR + 'catalog-feeds-us-to-localizable');
            if (!dir.isDirectory()) {
                dir.mkdir();
            }
        
        var file = new File(dir, output);
        var fileExists = file.exists();
        if (!fileExists)
        {
            if (!file.createNewFile()) {
                throw new Error("Unable to create new file: " + dir + " for agent tracking.");
            }
        }

        var fileWriter : FileWriter = new FileWriter(file, "UTF-8");
        var xsw : XMLStreamWriter = new XMLStreamWriter(fileWriter);
        xsw.writeStartDocument();
        xsw.writeStartElement("catalog");
        xsw.writeAttribute("xmlns", "http://www.demandware.com/xml/impex/catalog/2006-10-31");

        if (empty(params) || !params.CatalogId) {
            throw new Error("Catalog ID not specified");
        } else {
            xsw.writeAttribute("catalog-id", params.CatalogId);
        }

        
        const productIterator = ProductMgr.queryAllSiteProducts();

        while (productIterator.hasNext()) {
            let product = productIterator.next();

            let attributeSource;

            if (!empty(params.SourceCustomAttributeLocaleId)) {
                attributeSource = (product.custom[source] && product.custom[source][params.SourceCustomAttributeLocaleId]) ? product.custom[source][params.SourceCustomAttributeLocaleId] : null;
            } else {
                attributeSource = product.custom[source];
            }

            if (!empty(attributeSource)) { 
                xsw.writeStartElement("product");
                xsw.writeAttribute("product-id", product.ID);
                xsw.writeStartElement("custom-attributes");
                    xsw.writeStartElement("custom-attribute");
                    xsw.writeAttribute("attribute-id", target);
                    if (!empty(params.TargetCustomAttributeLocaleId)) {
                        xsw.writeAttribute("xml:lang", params.TargetCustomAttributeLocaleId);
                    }
                    xsw.writeCharacters(attributeSource);
                    xsw.writeEndElement();
                xsw.writeEndElement();
                xsw.writeEndElement();
            }  
                
        } 
        xsw.writeEndElement();
        xsw.close();
        fileWriter.close();       
    } catch (e) {
        logHandler.logger.error(e, 'job', 'Transfer Custom Attribute');
        return new Status(Status.ERROR, 'ERROR', e.message);
    }    
    return new Status(Status.OK);
}

/**
 * Batch job to set announcementHeading data to new attribute announcementHeadingLocalizable
 * @returns {Object} The resulting status
 */
function transferContentCustomAttributes(params){    
    try{
        var localeID = params.TargetCustomAttributeLocaleId && params.TargetCustomAttributeLocaleId == 'x-default' ? request.getLocale() : params.TargetCustomAttributeLocaleId.replace('-','_');
        request.setLocale(localeID);
        let output;
        if (empty(params) || !params.FileName) {
            throw new Error('Missing filename in parameter')
        } else {
            output = params.FileName + '.xml';
        }

        let source;
        if (empty(params) || !params.SourceCustomAttribute) {
            throw new Error('Missing source custom attribute ID')
        } else {
            source = params.SourceCustomAttribute;
        }

        
        let target;
        if (empty(params) || !params.TargetCustomAttribute) {
            throw new Error('Missing target custom attribute ID')
        } else {
            target = params.TargetCustomAttribute;
        }
        
        let LibraryId;
        if (!empty(params.LibraryId)) {
            LibraryId = params.LibraryId;
        }

        var dir = new File(File.IMPEX + File.SEPARATOR + 'src' + File.SEPARATOR + 'content-feeds');
            if (!dir.isDirectory()) {
                dir.mkdir();
            }
        
        var file = new File(dir, output);
        var fileExists = file.exists();
        if (!fileExists)
        {
            if (!file.createNewFile()) {
                throw new Error("Unable to create new file: " + dir + " for agent tracking.");
            }
        }

        var fileWriter : FileWriter = new FileWriter(file, "UTF-8");
        var xsw : XMLStreamWriter = new XMLStreamWriter(fileWriter);
        xsw.writeStartDocument();
        xsw.writeStartElement("library");
        xsw.writeAttribute("xmlns", "http://www.demandware.com/xml/impex/library/2006-10-31");

        if (!empty(LibraryId)) {
            xsw.writeAttribute("library-id", params.LibraryId);
        }
        var apiContentSearchModel = new ContentSearchModel();
        apiContentSearchModel.setRecursiveFolderSearch(true);
        apiContentSearchModel.setFolderID('all_content_assets');
        apiContentSearchModel.setFilteredByFolder(false); 
        apiContentSearchModel.search();
        var Assets = apiContentSearchModel.getContent();

        while(Assets.hasNext()) {
            let attributeSource;
            var asset = Assets.next();
            
            attributeSource = asset.custom[source];

            if (!empty(attributeSource)) {
                xsw.writeStartElement("content");
                xsw.writeAttribute("content-id", asset.ID);
                xsw.writeStartElement("custom-attributes");
                xsw.writeStartElement("custom-attribute");
                xsw.writeAttribute("attribute-id", target);
                if (!empty(params.TargetCustomAttributeLocaleId)) {
                    xsw.writeAttribute("xml:lang", params.TargetCustomAttributeLocaleId);
                }
                xsw.writeCharacters(attributeSource);
                xsw.writeEndElement();
                xsw.writeEndElement();
                xsw.writeEndElement();
            }

        }

        xsw.writeEndElement();
        xsw.close();
        fileWriter.close();       
    } catch (e) {
        logHandler.logger.error(e, 'job', 'Transfer Custom Attribute');
        return new Status(Status.ERROR, 'ERROR', e.message);
    }    
    return new Status(Status.OK);
}

module.exports = {
    transferContentCustomAttributes: transferContentCustomAttributes,
    transferProductCustomAttributes: transferProductCustomAttributes
}