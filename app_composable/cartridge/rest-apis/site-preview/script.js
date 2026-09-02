'use strict'

const ArrayList = require('dw/util/ArrayList');
const HashSet = require('dw/util/HashSet');
const Locale = require('dw/util/Locale');
const ShopperContext = require('dw/customer/shoppercontext/ShopperContext');
const ShopperContextMgr = require('dw/customer/shoppercontext/ShopperContextMgr');
const Site = require('dw/system/Site');
const System = require('dw/system/System');



const apiImplementation = require('app_composable/cartridge/scripts/apis/emailSubscription.js');
const apiUtils = require('app_composable/cartridge/scripts/apiUtils.js');
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;
const dataValidation = require('app_composable/cartridge/scripts/helpers/util/dataValidation.js').dataValidation;
const errorHandler = require('app_composable/cartridge/scripts/helpers/util/errorHandler.js').errorHandler;

/**
 * This SCAPI CUSTOM API endpoint is used to create an emailSubscription custom object when user opts into
 * marketing emails in the footer or after placing an order
 */
exports.sitePreview = function () {
    try {

        if (System.getInstanceType() === System.PRODUCTION_SYSTEM) {
            throw new errorHandler.error('SITE-PREVIEW-01-001');
        }

        const requestBody = JSON.parse(request.httpParameterMap.requestBodyAsString);
        const date = dataValidation.emptyCheck(requestBody.date, '');
        const customerGroups = dataValidation.emptyCheck(requestBody.customerGroups, '');
        const sourceCode = dataValidation.emptyCheck(requestBody.sourceCode, '');
        const customQualifiers = dataValidation.emptyCheck(requestBody.customQualifiers, '');

        if (empty(date) && empty(customerGroups) && empty(sourceCode) && empty(customQualifiers)) {
            throw new errorHandler.error('SITE-PREVIEW-04-001');
        }


        var shopperContext;

        if (session.custom.init) {
            shopperContext = ShopperContextMgr.getShopperContext();
        }

        // Initiate shopper context if it does not exist
        if (empty(shopperContext)) {
            shopperContext = new ShopperContext();
            let clientIp = (request.httpHeaders.get('c_fastly-client-ip')) || (request.httpRemoteAddress);
            shopperContext.setClientIP(clientIp);
        }

        if (!empty(date)) {
            
            var dateType = new Date(date);

            if (isNaN(dateType.getTime())) {
                throw new errorHandler.error('SITE-PREVIEW-04-002');                
            }

            shopperContext.setEffectiveDateTime(dateType)
        }

        if (!empty(customerGroups)) {
            if (!Array.isArray(customerGroups)) {
                throw new errorHandler.error('SITE-PREVIEW-04-003');
            }

            let hashCustomerGroups = new HashSet(new ArrayList(customerGroups));

            shopperContext.setCustomerGroupIDs(hashCustomerGroups);
        }

        if (!empty(sourceCode)) {
            if (typeof sourceCode != 'string') {
                throw new errorHandler.error('SITE-PREVIEW-04-004');
            }

            shopperContext.setSourceCode(sourceCode);
        }
        
        if (!empty(customQualifiers)) {
            let hashCustomQualifiers = new dw.util.HashMap();

            for (let customQualifier in customQualifiers) {
                hashCustomQualifiers.put( customQualifier, customQualifiers[customQualifier]);
            }

            shopperContext.setCustomQualifiers(hashCustomQualifiers);
        }

        var response = { "success": true, "status": 200 };

        response.date = shopperContext.effectiveDateTime.getTime();
        response.dateReadable = shopperContext.effectiveDateTime.toLocaleString();

        if (!empty(shopperContext.customerGroupIDs)){
            response.customerGroups = [];
            
            for (let i = 0; i < shopperContext.customerGroupIDs.length; i++) {
                response.customerGroups.push(shopperContext.customerGroupIDs[i])
            }
        }
        
        if (!empty(shopperContext.sourceCode)){
            response.sourceCode = shopperContext.sourceCode;
        }

        if (!empty(shopperContext.customQualifiers)) {
            response.customQualifiers = {};

            let arrayCustomQualifiers = shopperContext.customQualifiers.entrySet().toArray();

            for (let i = 0; i < arrayCustomQualifiers.length; i++) {
                let customQualifier = arrayCustomQualifiers[i];
                response.customQualifiers[customQualifier.getKey()] = customQualifier.getValue();
            }
        
        }

        ShopperContextMgr.setShopperContext(shopperContext, true);

        apiUtils.createResponse(response.status, response);
    } catch (e) {
        let httpCode = e.httpCode || 500;
        apiUtils.createError(httpCode, {
            title: e.name || 'SitePreviewAPIError',
            type: e.type || 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/' + httpCode,
            detail: e.message || 'An unexpected error occurred while processing the request.'
        });
        logHandler.logger.error(e, 'CustomAPI', 'SitePreview');
    }
};

exports.sitePreview.public = true;
