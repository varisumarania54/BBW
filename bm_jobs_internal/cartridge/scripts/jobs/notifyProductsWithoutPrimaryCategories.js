'use strict';

/**
 * Job script to identify and notify about products missing primary category assignments.
 * 
 * This script scans all site products and identifies those that are:
 * - Online and searchable
 * - Categorized but missing a primary category
 * - Not variants and not virtual products
 * 
 * An email notification is sent if any products are found missing primary categories.
 * 
 * @module scripts/jobs/notifyProductsPrimaryCategory
 */

const ProductMgr = require('dw/catalog/ProductMgr');
const Mail = require('dw/net/Mail');
const Status = require('dw/system/Status');
const Site = require('dw/system/Site');
const Logger = require('dw/system/Logger');

// Initialize logger for this job
const logger = Logger.getLogger('jobs', 'notifyProductsPrimaryCategory');

/**
 * Main job execution function that checks for products without primary categories
 * and sends email notification if any are found.
 * 
 * @param {Object} params - Job parameters
 * @returns {dw.system.Status} Job execution status
 */
function notifyProductsWithoutPrimaryCategories(params) {
    const siteID = Site.getCurrent().getID();

    logger.info('Starting primary category check for site: {0}', siteID);

    try {
        // Validate required parameters
        if (!params.notificationEmailList) {
            logger.error('Missing required parameter: notificationEmailList');
            return new Status(Status.ERROR, 'ERROR', 'Missing required parameter: notificationEmailList');
        }

        let errorProductsForEmail = [];
        let totalProductsChecked = 0;

        // Query all products for the current site
        let products = ProductMgr.queryAllSiteProducts();
        logger.info('Starting product iteration');

        // Iterate through all site products
        while (products.hasNext()) {
            let product = products.next();
            totalProductsChecked++;

            // Check if product meets criteria for primary category requirement:
            // - Must be online (visible to customers)
            // - Must be searchable (appears in search results)
            // - Must be categorized (assigned to at least one category)
            // - Must not be a variant (only check master products)
            // - Must not be a virtual product (custom business logic)
            if (
                product.online &&
                product.searchable &&
                product.categorized &&
                !product.variant &&
                !product.custom.isVirtual
            ) {
                // If primary category is missing, add to error list
                if (empty(product.primaryCategory)) {
                    errorProductsForEmail.push(`${product.ID}`);
                    logger.debug('Product missing primary category: {0} - {1}', product.ID, product.name);
                }
            }
        }

        logger.info('Product check complete. Checked: {0}, Missing primary category: {1}',
            totalProductsChecked, errorProductsForEmail.length);

        // Send email notification if products are missing primary categories
        if (errorProductsForEmail.length > 0) {
            logger.info('Sending notification email to: {0}', params.notificationEmailList);

            let senderEmail = params.senderEmail || 'noreply@bbw.com';
            let recipientEmailAddresses = params.notificationEmailList.split(',');
            let mail = new Mail();

            for (let i = 0; i < recipientEmailAddresses.length; i++) {
                mail.addTo(recipientEmailAddresses[i]);
            }

            mail.setFrom(senderEmail);
            mail.setSubject(`Products with no primary categories (Site: ${siteID})`);
            mail.setContent(errorProductsForEmail.join("\n"));

            logger.info("Products missing primary categories:\n{0}", errorProductsForEmail.join("\n"));
            
            //write errorProductsForEmail to a text file in the logs folder for reference
            let File = require('dw/io/File');
            let FileWriter = require('dw/io/FileWriter');
            let logFileName = 'products_missing_primary_categories.txt';
            let dir = new File(File.IMPEX + File.SEPARATOR + 'src' + File.SEPARATOR + 'products_without_categories');
            
            if (!dir.isDirectory()) {
                dir.mkdir();
            }

            let contentFile = new File(dir, logFileName);
            let contentFileExists = contentFile.exists();

            if (!contentFileExists) {
                if (!contentFile.createNewFile()) {
                    logger.error("Unable to create new log file: {0}", contentFile);
                    throw new Error("Unable to create new log file: " + contentFile);
                }
            }

            const contentWriter = new FileWriter(contentFile, 'UTF-8');
            contentWriter.writeLine("Products missing primary categories:");
            errorProductsForEmail.forEach(function (productInfo) {
                contentWriter.writeLine(productInfo);
            });
            contentWriter.close();
            
            // Send the email
            let mailStatus = mail.send();

            if (mailStatus.isError()) {
                logger.error('Failed to send notification email: {0}', mailStatus.getMessage());
                return new Status(Status.ERROR, 'EMAIL_ERROR',
                    'Found products without primary categories but failed to send notification email');
            }

            logger.info('Notification email sent successfully');

        } else {
            logger.info('No products found missing primary categories. No notification sent.');
        }

        logger.info('Job completed successfully');
        return new Status(Status.OK);

    } catch (error) {
        logger.error('Job execution failed with error: {0}', error.message);
        if (error.stack) {
            logger.error('Stack trace: {0}', error.stack);
        }
        return new Status(Status.ERROR, 'ERROR', error.message);
    }
};

exports.execute = notifyProductsWithoutPrimaryCategories;