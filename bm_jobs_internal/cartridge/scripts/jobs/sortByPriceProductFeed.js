//'use strict';

/* Import necessary dependencies */
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;
const ProductHelper = require('app_composable/cartridge/scripts/helpers/objects/product.js');
const ProductMgr = require('dw/catalog/ProductMgr'); 
const Status = require('dw/system/Status');
const FileWriter = require('dw/io/FileWriter');
const XMLStreamWriter = require('dw/io/XMLStreamWriter');
const File = require('dw/io/File')

/**
 * Batch job to set sort prices in the product data c_sortPrice
 * @returns {Object} The resulting status
 */
function setSortByPriceProductFeed(params){    
    try{
        let output;
        if(empty(params) || !params.FileName){
            throw new Error('Missing filename in parameter')
        }else{
            output = params.FileName + '.xml';
        }

        var dir = new File(File.IMPEX + File.SEPARATOR + 'src' + File.SEPARATOR + 'catalog-feeds');
            if (!dir.isDirectory()) {
                dir.mkdir();
            }
        
        var file = new File(dir, output);
        var fileExists = file.exists();
        if(!fileExists)
        {
            if(!file.createNewFile())
                {
            throw new Error("Unable to create new file: " + dir + " for agent tracking.");
            }
        }

        var fileWriter : FileWriter = new FileWriter(file, "UTF-8");
        var xsw : XMLStreamWriter = new XMLStreamWriter(fileWriter);
        xsw.writeStartDocument();
        xsw.writeStartElement("catalog");
        xsw.writeAttribute("xmlns", "http://www.demandware.com/xml/impex/catalog/2006-10-31");
        xsw.writeAttribute("catalog-id", "master-catalog");
        const productIterator = ProductMgr.queryAllSiteProducts();

        while(productIterator.hasNext()) {
            var product = productIterator.next();
            if(product.online && product.searchable) {
                // calculate price and write to a file.
                var salesPrice = ProductHelper.getProductSalePriceWithoutCustomer(product);
                var listPrice = ProductHelper.getProductStandardPrice(product);
                var finalPrice;

                    if(!empty(salesPrice) && salesPrice != 0){
                        finalPrice = salesPrice;
                    }else if(!empty(listPrice)){
                        finalPrice = listPrice;
                    }

                    if(!empty(finalPrice)){   
                        xsw.writeStartElement("product");
                        xsw.writeAttribute("product-id", product.ID);
                        xsw.writeStartElement("custom-attributes");
                            xsw.writeStartElement("custom-attribute");
                                xsw.writeAttribute("attribute-id", "sortPrice");
                                xsw.writeCharacters(finalPrice);
                            xsw.writeEndElement();
                        xsw.writeEndElement();
                        xsw.writeEndElement();
                    }   
                }
        } 
        xsw.writeEndElement();
        xsw.close();
        fileWriter.close();       
    }catch (e) {
        logHandler.logger.error(e, 'job', 'PLP set Sort Prices');
        return new Status(Status.ERROR, 'ERROR', e.message);
    }    
    return new Status(Status.OK);
}
module.exports = {
    setSortByPriceProductFeed : setSortByPriceProductFeed
}