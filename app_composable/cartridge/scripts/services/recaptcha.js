const LocalServiceRegistry = require('dw/svc/LocalServiceRegistry');

const service = LocalServiceRegistry.createService('google.recaptcha', {
    createRequest: function (svc, args) {
        svc.addHeader('Content-Type', 'application/x-www-form-urlencoded');
        svc.setAuthentication('NONE');
        svc.setRequestMethod('POST');
        svc.addParam('secret', args.privateKey);
        svc.addParam('response', args.token);
        return;
    },
    parseResponse: function (svc, client) {
        let clientResponse;
        try {
            clientResponse = JSON.parse(client.text);
        } catch (error) {
            clientResponse = error;
        }
        return clientResponse;
    },
    getRequestLogMessage: function (request) {
        return request;
    },
    getResponseLogMessage: function (response) {
        return response.text;
    },
    mockCall: function (svc, args) {
        return {
            statusCode: 200,
            statusMessage: 'Success',
            text: JSON.stringify({ success: true })
        }
    }
})

const enterpriseService = LocalServiceRegistry.createService('google.recaptcha.enterprise', {
    createRequest: function (svc, args) {
        svc.addHeader('Content-Type', 'application/json');
        svc.setAuthentication('NONE');
        svc.setRequestMethod('POST');
        const body = {
            "event": {
                "token": args.token,
                "siteKey": args.privateKey
            }
        }
        if(args.action){
            body.event.expectedAction = args.action;
        }
        return JSON.stringify(body);
    },
    parseResponse: function (svc, client) {
        let clientResponse;
        try {
            clientResponse = JSON.parse(client.text);
        } catch (error) {
            clientResponse = error;
        }
        return clientResponse;
    },
    getRequestLogMessage: function (request) {
        return request;
    },
    getResponseLogMessage: function (response) {
        return response.text;
    },
    mockCall: function (svc, args) {
        return {
            statusCode: 200,
            statusMessage: 'Success',
            text: JSON.stringify({ success: true })
        }
    }
})

module.exports = { service,enterpriseService };
