var Site = require('dw/system/Site');
var LocalServiceRegistry = require('dw/svc/LocalServiceRegistry');
var StringUtils = require('dw/util/StringUtils');
var CONTENT_SLOT_SERVICE_URL = "";
var CONTENT_ASSET_SERVICE_URL = "";
module.exports = {
    GetOAuth: LocalServiceRegistry.createService("OCAPI.customApiAuth", {
        createRequest: function (svc, req) {
            // Get Service Credentials
            const credentials = svc.getConfiguration().getCredential();
            // Set Service headers and request method type

            svc.setRequestMethod('POST');
            const bearer = StringUtils.encodeBase64(credentials.getUser() + ':' + credentials.getPassword());
            svc.addHeader('Authorization', 'Basic'.concat(' ', bearer));
            svc.setRequestMethod('POST');

            // empty request body
            return;
        },
        parseResponse: function (svc, client) {
            let res = JSON.parse(client.text);
            return res;
        },
        getResponseLogMessage: function (response) {
            return !empty(response.getText()) ? response.getText() : 'Response is empty.';
        },
        mockCall: function (svc, req) { }
    }),
    slotSearch: LocalServiceRegistry.createService("OCAPI.slotSearch", {
        createRequest: function (svc, req) {

            // build the request body
            let body = {
                "query": {
                    "bool_query": {
                        "must": [
                            {
                                "term_query": {
                                    "fields": [
                                        "slot_id"
                                    ],
                                    "operator": "one_of",
                                    "values": req.slots
                                }
                            },
                            {
                                "term_query": {
                                    "fields": [
                                        "enabled"
                                    ],
                                    "operator": "is",
                                    "values": [
                                        true
                                    ]
                                }
                            }
                        ]
                    }
                },
                "count": 200,
                "select": "(**)",
                "sorts": [
                    {
                        "field": "slot_id",
                        "sort_order": "asc"
                    }
                ],
                "start": req.start
            }

            // Conditionally add the `context_id` query if req.context is not null or undefined
            if (req.context) {
                let contextValues = req.context.includes(',') 
                    ? req.context.split(',')
                    : [req.context];
            
                body.query.bool_query.must.push({
                    "term_query": {
                        "fields": ["context_id"],
                        "operator": "one_of",
                        "values": contextValues
                    }
                });
            }
            CONTENT_SLOT_SERVICE_URL = empty(CONTENT_SLOT_SERVICE_URL) ? svc.getURL() : CONTENT_SLOT_SERVICE_URL;
            svc.setURL(StringUtils.format(CONTENT_SLOT_SERVICE_URL, req.host, req.siteId));
            // Set the headers and format the request url
            svc.setRequestMethod('POST');
            svc.addHeader('Content-Type', 'application/json');
            svc.addHeader('Authorization', 'Bearer'.concat(' ', req.token));

            // return empty request body
            return JSON.stringify(body, null, 4);
        },
        parseResponse: function (svc, client) {
            let res = JSON.parse(client.text);
            return res;
        },
        getResponseLogMessage: function (response) {
            return !empty(response.getText()) ? response.getText() : 'Response is empty.';
        },
        mockCall: function (svc, req) { }
    }),
    getSlotConfig: function () {
        return {
            call: function (params) {
                let httpClient = require('dw/net/HTTPClient');
                let client = new httpClient();
                let url = params.requestPath;
                let method = params.requestMethod;
                let token = params.token;

                client.open(method, url);
                client.setRequestHeader('Authorization', 'Bearer ' + token);
                client.send();

                if (client.statusCode === 200) {
                    return {
                        object: {
                            text: client
                        },
                        errorMessage: null
                    };
                } else {
                    return {
                        object: null,
                        errorMessage: 'Error retrieving slot configuration: ' + client
                    };
                }
            }
        };
    },
    GetOAuthInv: LocalServiceRegistry.createService("OCAPI.OAuth", {
        createRequest: function (svc, req) {
            // Get Service Credentials
            const credentials = svc.getConfiguration().getCredential();
            // Set Service headers and request method type

            svc.setRequestMethod('POST');
            const bearer = StringUtils.encodeBase64(credentials.getUser() + ':' + credentials.getPassword());
            svc.addHeader('Authorization', 'Basic'.concat(' ', bearer));
            svc.setRequestMethod('POST');

            // empty request body
            return;
        },
        parseResponse: function (svc, client) {
            let res = JSON.parse(client.text);
            return res;
        },
        getResponseLogMessage: function (response) {
            return !empty(response.getText()) ? response.getText() : 'Response is empty.';
        },
        mockCall: function (svc, req) { }
    }),
    PatchInventory: LocalServiceRegistry.createService("OCAPI.PatchInventory", {
        createRequest: function (svc, req) {
            // get the current timestamp for the inventory record
            let resetDate = new Date().toISOString().split('.')[0] + '-00:00';

            // build the request body
            let body = {
                "allocation": {
                    "amount": 0,
                    "reset_date": resetDate
                }
            };

            // Set the headers and format the request url
            svc.setRequestMethod('PATCH');
            svc.setURL(StringUtils.format(svc.getURL(), req.host, req.inventory_list_id, req.pid));
            svc.addHeader('Content-Type', 'application/json');
            svc.addHeader('Authorization', 'Bearer'.concat(' ', req.access_token));

            // return empty request body
            return JSON.stringify(body, null, 4);
        },
        parseResponse: function (svc, client) {
            let res = JSON.parse(client.text);
            return res;
        },
        getResponseLogMessage: function (response) {
            return !empty(response.getText()) ? response.getText() : 'Response is empty.';
        },
        mockCall: function (svc, req) { },
        filterLogMessage: function (msg) {
            return msg;
        }
    }),
    GetOAuthCC: LocalServiceRegistry.createService("OCAPI.OAuth.CC", {
        createRequest: function (svc, req) {
            // Get Service Credentials
            const credentials = svc.getConfiguration().getCredential();
            // Set Service headers and request method type

            svc.setRequestMethod('POST');
            const bearer = StringUtils.encodeBase64(credentials.getUser() + ':' + credentials.getPassword());
            svc.addHeader('Authorization', 'Basic'.concat(' ', bearer));
            svc.setRequestMethod('POST');

            // empty request body
            return;
        },
        parseResponse: function (svc, client) {
            let res = JSON.parse(client.text);
            return res;
        },
        getResponseLogMessage: function (response) {
            return !empty(response.getText()) ? response.getText() : 'Response is empty.';
        },
        mockCall: function (svc, req) { }
    }),
    GetUser: LocalServiceRegistry.createService("SecurePayment.GetUser", {
        createRequest: function (svc, req) {

            // Set Service headers and request method type
            svc.setRequestMethod('GET');
            svc.setURL(StringUtils.format(svc.getURL(), req.host, req.email));
            svc.addHeader('Content-Type', 'application/json');
            svc.addHeader('Authorization', 'Bearer'.concat(' ', req.access_token));

            // return svc URL
            return svc.URL;
        },
        parseResponse: function (svc, client) {
            var res = JSON.parse(client.text);
            return res;
        },
        getResponseLogMessage: function (response) {
            return !empty(response.getText()) ? response.getText() : 'Response is empty.';
        },
        mockCall: function (svc, req) { },
        filterLogMessage: function (msg) {
            return msg;
        }
    })
}
