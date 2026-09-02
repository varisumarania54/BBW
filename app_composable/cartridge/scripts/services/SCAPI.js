var Site = require('dw/system/Site');
var LocalServiceRegistry = require('dw/svc/LocalServiceRegistry');
var StringUtils = require('dw/util/StringUtils');
var CONTENT_SLOT_SERVICE_URL = "";
var CONTENT_ASSET_SERVICE_URL = "";
module.exports = {
    ShopperContext: LocalServiceRegistry.createService("SCAPI.shopperContext", {
        createRequest: function(svc, req) {
            // Get Service Credentials
            const credentials = svc.getConfiguration().getCredential();
            // Set Service headers and request method type

            // build the request body
            const body = {
                "clientIp": req.clientIp,
                "customQualifiers" : req.requestBody
            }

            svc.setRequestMethod('PUT');
            svc.addHeader('Authorization', req.auth);
            const site = dw.system.Site.current;
            svc.setURL(StringUtils.format(svc.getURL(), req.organizationId, req.usid, site.ID));
            return JSON.stringify(body);
        },
        parseResponse: function (svc, client) {
            const res = JSON.parse(client.text);
            return {res : res, responseHeaders: client.responseHeaders};
        },
        mockCall: function(svc, req) {},
        filterLogMessage: function (msg) {
            return msg;
        }
    }),
    ShopperContextPatch: LocalServiceRegistry.createService("SCAPI.shopperContext", {
        createRequest: function(svc, req) {
            // Get Service Credentials
            const credentials = svc.getConfiguration().getCredential();
            // Set Service headers and request method type

            // build the request body
            const body = {
                "clientIp": req.clientIp,
                "customQualifiers" : req.requestBody
            }

            svc.setRequestMethod('PATCH');
            svc.addHeader('Authorization', req.auth);
            const site = dw.system.Site.current;
            svc.setURL(StringUtils.format(svc.getURL(), req.organizationId, req.usid, site.ID + "&c_client_id=" + req.c_client_id));
            return JSON.stringify(body);
        },
        parseResponse: function (svc, client) {
            const res = JSON.parse(client.text);
            return {res : res, responseHeaders: client.responseHeaders};
        },
        mockCall: function(svc, req) {},
        filterLogMessage: function (msg) {
            return msg;
        }
    })
}
