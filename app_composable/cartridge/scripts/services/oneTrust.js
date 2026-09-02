const LocalServiceRegistry = require('dw/svc/LocalServiceRegistry');
const service = LocalServiceRegistry.createService('onetrust.dns.optin', {
    createRequest: function (svc, req) {
        const apiToken = svc.configuration.credential.custom.apiToken || null;
        if (empty(apiToken)) {
            throw new Error('credentials missing api token');
        }
        svc.setRequestMethod('POST');
        svc.addHeader('Content-Type', 'application/json');
        svc.addHeader('accessToken', apiToken);
        return JSON.stringify(req);
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
            text: JSON.stringify({})
        }
    }
})

module.exports = { service };