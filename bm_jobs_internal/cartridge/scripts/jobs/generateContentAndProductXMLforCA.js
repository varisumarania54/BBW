'use strict';

const ProductMgr = require('dw/catalog/ProductMgr');
const ContentMgr = require('dw/content/ContentMgr');
const File = require('dw/io/File');
const FileWriter = require('dw/io/FileWriter');
const XMLStreamWriter = require('dw/io/XMLStreamWriter');
const Logger = require('dw/system/Logger');
const Site = require('dw/system/Site');

function generateContentAndProductXML(params) {
    const productIterator = ProductMgr.queryAllSiteProducts();

    let contentFileName = 'content-assets.xml';
    let productFileName = 'products.xml';

    var dir = new File(File.IMPEX + File.SEPARATOR + 'src' + File.SEPARATOR + 'ingredient-feeds');
    if (!dir.isDirectory()) {
        dir.mkdir();
    }
    
    var contentFile = new File(dir, contentFileName);
    var productFile = new File(dir, productFileName);
    var contentFileExists = contentFile.exists();
    var productFileExists = productFile.exists();

    if(!contentFileExists || !productFileExists){
        if(!contentFile.createNewFile() || !productFile.createNewFile()){
            throw new Error("Unable to create new files: " + dir );
        }
    }
    
    const contentWriter = new XMLStreamWriter(new FileWriter(contentFile, 'UTF-8'));
    const productWriter = new XMLStreamWriter(new FileWriter(productFile, 'UTF-8'));
    var fullAssetsUpdate = false ;
    if(!empty(params) && params.FullAssetsUpdate){
        fullAssetsUpdate = params.FullAssetsUpdate   ;
    }
    try {
        // Start content XML
        contentWriter.writeStartDocument('UTF-8', '1.0');
        contentWriter.writeStartElement('library');
        contentWriter.writeAttribute('xmlns', 'http://www.demandware.com/xml/impex/library/2006-10-31');
        contentWriter.writeAttribute('library-id', 'BBWCASharedLibrary');

        // Start product XML
        productWriter.writeStartDocument('UTF-8', '1.0');
        productWriter.writeStartElement('catalog');
        productWriter.writeAttribute('xmlns', 'http://www.demandware.com/xml/impex/catalog/2006-10-31');
        productWriter.writeAttribute('catalog-id', 'bbw_ca-storefront-catalog');

        while (productIterator.hasNext()) {
            let product = productIterator.next();
            let productId = product.getID();
            let contentId = 'ingredient-' + productId;
            let contentAsset = ContentMgr.getContent(contentId);

            //If full assets update it will update all the assets though it updated in the previous run 
            if(product && contentAsset && contentAsset.custom.IngredientsDescription && (!fullAssetsUpdate ? !contentAsset.custom.IngredientUPC || !contentAsset.searchableFlag : true)) {
                let productUPC = product.UPC || '';

                // --- Content Feed XML ---
                contentWriter.writeStartElement('content');
                contentWriter.writeAttribute('content-id', contentId);

                contentWriter.writeStartElement('searchable-flag');
                contentWriter.writeCharacters('true'); // updated per your request
                contentWriter.writeEndElement();

                contentWriter.writeStartElement('custom-attributes');

                contentWriter.writeStartElement('custom-attribute');
                contentWriter.writeAttribute('attribute-id', 'IngredientUPC');
                contentWriter.writeCharacters(productUPC);
                contentWriter.writeEndElement();

                contentWriter.writeEndElement(); // </custom-attributes>

                contentWriter.writeStartElement('folder-links');
                contentWriter.writeEmptyElement('classification-link');
                contentWriter.writeAttribute('folder-id', 'ingredients-Body_Care');

                contentWriter.writeEmptyElement('folder-link');
                contentWriter.writeAttribute('folder-id', 'ingredients-articles');

                contentWriter.writeEndElement(); // </folder-links>

                contentWriter.writeEndElement(); // </content>

                // --- Product Feed XML ---
                productWriter.writeStartElement('product');
                productWriter.writeAttribute('product-id', productId);

                productWriter.writeStartElement('custom-attributes');

                productWriter.writeStartElement('custom-attribute');
                productWriter.writeAttribute('attribute-id', 'hasILNAssociation');
                productWriter.writeCharacters('true');
                productWriter.writeEndElement();

                productWriter.writeEndElement(); // </custom-attributes>

                productWriter.writeEndElement(); // </product>
            }
        }

        // Close XML documents
        contentWriter.writeEndElement(); // </library>
        contentWriter.writeEndDocument();
        contentWriter.flush();
        contentWriter.close();

        productWriter.writeEndElement(); // </catalog>
        productWriter.writeEndDocument();
        productWriter.flush();
        productWriter.close();

        Logger.info('XML feeds generated: content-assets.xml and products.xml');

    } catch (e) {
        Logger.error('Error generating XML: {0}', e.message);
    } finally {
        productIterator.close();
    }
}

module.exports = {
    generateContentAndProductXML: generateContentAndProductXML
};
