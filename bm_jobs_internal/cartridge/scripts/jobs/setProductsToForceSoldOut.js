'use strict';

const Status = require('dw/system/Status');
const ProductMgr = require('dw/catalog/ProductMgr');
const Site = require('dw/system/Site').getCurrent();
const File = require('dw/io/File');
const FileWriter = require('dw/io/FileWriter');
const XMLStreamWriter = require('dw/io/XMLStreamWriter');


const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;


function writeProductForceSoldOut(xsw, productId, forceSoldOut) {
    xsw.writeStartElement("product");
        xsw.writeAttribute("product-id", productId);
        xsw.writeStartElement("custom-attributes");
            xsw.writeStartElement("custom-attribute");
                xsw.writeAttribute("attribute-id", "forceSoldOutRightNow");
                xsw.writeCharacters(forceSoldOut);
            xsw.writeEndElement();
        xsw.writeEndElement();
    xsw.writeEndElement();
}

/**
 * Placeholder job step for setting products to force sold out.
 *
 * @returns {dw.system.Status} Job execution status
 */
function execute(params) {
    let fileWriter;
    let xsw;
    let productIterator;
    let catalogId;

    if (empty(params) || !params.CatalogId) {
        throw new Error("Catalog ID not specified");
    } else {
        catalogId = params.CatalogId;
    }


	try {
        const ForceSoldOutHelper = require('app_composable/cartridge/scripts/helpers/global/ForceSoldOutHelper.js');
        let output = catalogId + '.xml';

        let dir = new File(File.IMPEX + File.SEPARATOR + 'src' + File.SEPARATOR + 'force-sold-out-products');
        if (!dir.isDirectory()) {
            dir.mkdir();
        }

        let file = new File(dir, output);
        let fileExists = file.exists();
        if (!fileExists)
        {
            if (!file.createNewFile()) {
                throw new Error("Unable to create new file: " + dir + " for agent tracking.");
            }
        }

        fileWriter = new FileWriter(file, "UTF-8");
        xsw = new XMLStreamWriter(fileWriter);
        xsw.writeStartDocument();
        xsw.writeStartElement("catalog");
            xsw.writeAttribute("xmlns", "http://www.demandware.com/xml/impex/catalog/2006-10-31");

            //get the current site's storefront catalog
        
            xsw.writeAttribute("catalog-id", catalogId);

            productIterator = ProductMgr.queryAllSiteProducts();
        
    
            if (Site.getCustomPreferenceValue('enableForceSoldOutCheck')) {
                while (productIterator.hasNext()) {
                    let product = productIterator.next();

                    if (!product.online) {
                        continue;
                    }

                    let forceSoldOut = ForceSoldOutHelper.isMarkedAsSoldOutProduct(product);

                    if (forceSoldOut !== product.custom.forceSoldOutRightNow) {

                        writeProductForceSoldOut(xsw, product.ID, forceSoldOut.toString());

                    }
                }
            } else {
                while (productIterator.hasNext()) {
                    let product = productIterator.next();

                    if (!product.online) {
                        continue;
                    }

                    if (product.custom.forceSoldOutRightNow === true) {
                        writeProductForceSoldOut(xsw, product.ID, "false");
                    }
                }
            }

        xsw.writeEndElement();

		// TODO: Implement job logic.
		return new Status(Status.OK);
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
        logHandler.logger.error(e, 'job', 'ForceSoldOutProducts');
		return new Status(Status.ERROR, 'ERROR', message);
    } finally {
        if (productIterator) {
            productIterator.close();
        }

        if (xsw) {
            xsw.close();
        }

        if (fileWriter) {
            fileWriter.close();
        }
	}
}

module.exports = {
	execute
};
