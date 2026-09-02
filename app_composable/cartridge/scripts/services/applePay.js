const LocalServiceRegistry = require('dw/svc/LocalServiceRegistry');
module.exports = {
    paymentSession: LocalServiceRegistry.createService("applePay", {
        createRequest: function(svc, req) {
            const credentials = svc.getConfiguration().getCredential();
            const validHosts = dw.system.Site.getCurrent().getCustomPreferenceValue('applePayHosts');
            svc.setRequestMethod('POST');
            if (!validHosts.some(host=> req.validationURL.indexOf(host) !== -1)){
                throw new Error("Invalid domain")
            }
            svc.setURL(req.validationURL);
            const body = {
                merchantIdentifier : credentials.user,
                displayName: "Bath and Body Works",
                initiative: "web",
                initiativeContext: dw.system.Site.getCurrent().getCustomPreferenceValue('applePayinitiativeContext')
            }
            return JSON.stringify(body);
        },
        parseResponse: function (svc, client) {
            var res = JSON.parse(client.text);
            return res;
        },
        getResponseLogMessage: function (response) {
            return !empty(response.getText()) ? response.getText() : 'Response is empty.';
        },
        mockCall: function(svc, req) {},
    }),
}
