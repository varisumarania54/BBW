importPackage(dw.svc);
importPackage(dw.net);
importPackage(dw.io);

var StringUtils = require('dw/util/StringUtils');
var Site = require('dw/system/Site').getCurrent();

var LocalServiceRegistry = require('dw/svc/LocalServiceRegistry');

module.exports = {
    GetToken: LocalServiceRegistry.createService("SecurePayment.GetToken", {
        createRequest: function (svc, req) {
            // Get Service Credentials
            const credentials = svc.getConfiguration().getCredential();

            // Set Service headers and request method type
            svc.addHeader('Accept', 'application/json');
            svc.addHeader('Content-Type', 'application/x-www-form-urlencoded');
            svc.setRequestMethod('POST');

            // Appending service credentials to request body
            req.client_id = credentials.user;
            req.client_secret = credentials.password;

            // Convert and return request body object as a url encoded string
            return objectToParams(req);
        },
        parseResponse: function (svc, client) {

            var data = {};
            // If the service response was successful return only required data
            if (client.statusMessage == 'OK') {
                var response = JSON.parse(client.text);
                data.access_token = response.access_token;
                data.refresh_token = response.refresh_token;
                data.expires = new Date(response['.expires'].replace(/-/g, '/').replace('T', ' ').replace('Z', ''));
            }
            return data;

        },
        getRequestLogMessage: function (request) {
            return maskParams(['client_id', 'client_secret'], request);
        },
        getResponseLogMessage: function (response) {
            return !empty(response.getText()) ? response.getText() : 'Response is empty.';
        }
    }),
    SessionGeneration: LocalServiceRegistry.createService("SecurePayment.SessionGeneration.v2", {
        createRequest: function (svc, req) {
            // Set Service headers and request method type
            svc.addHeader('Content-Type', 'application/json');
            svc.addHeader('Authorization', 'Bearer'.concat(' ', req.token));
            svc.setRequestMethod('POST');
            svc.setURL(StringUtils.format(svc.getURL(), req.tenant_id));
            // Build request body
            return JSON.stringify(req.body);
        },
        parseResponse: function (svc, client) {
            return JSON.parse(client.getText());
        },
        getResponseLogMessage: function (response) {
            return !empty(response.getText()) ? response.getText() : 'Response is empty.';
        }
    }),
    PollSession: LocalServiceRegistry.createService("SecurePayment.PollSession", {
        createRequest: function (svc, req) {
            // Get Service Credentials
            const credentials = svc.getConfiguration().getCredential();

            // Set Service headers and request method type
            svc.addHeader('Content-Type', 'application/x-www-form-urlencoded');
            svc.addHeader('Authorization', 'Bearer'.concat(' ', req.token));
            svc.setRequestMethod('GET');
            svc.setURL(StringUtils.format(svc.getURL(), req.body.tenant_id, req.body.pcipal_session_id));
        },
        parseResponse: function (svc, client) {

        },
        getRequestLogMessage: function (request) {
            return maskParams(['client_id', 'client_secret'], request);
        },
        getResponseLogMessage: function (response) {
            return !empty(response.getText()) ? response.getText() : 'Response is empty.';
        }
    }),
}

function objectToParams(obj) {
    let params = [];
    for (o in obj) {
        params.push(encodeURIComponent(o).concat('=', encodeURIComponent(obj[o])));
    }
    return params.join('&');
}

function maskParams(keys, params) {
    let re;
    for (i in keys) {
        re = new RegExp(keys[i] + '=[^&]*');
        params = params.replace(re, keys[i].concat('=', '*****'));
    }
    return params;
}

