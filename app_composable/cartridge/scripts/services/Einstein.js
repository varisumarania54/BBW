const LocalServiceRegistry = require('dw/svc/LocalServiceRegistry');
const StringUtils = require('dw/util/StringUtils');
const Site = require('dw/system/Site');

module.exports = {
    getRecommendations: LocalServiceRegistry.createService("Einstein.getRecommendations", {
        createRequest: function (svc, req) {
            
            svc.setRequestMethod('POST');

            const credentials = svc.getConfiguration().getCredential();
            const clientId = credentials.getPassword();
            svc.addHeader('x-cq-client-id', clientId);

            let endpoint = svc.getURL();
            let siteId = Site.getCurrent().getEinsteinSiteID();
            let recommenderName = req.recommenderName || '';
            let serviceUrl = StringUtils.format(endpoint, siteId, recommenderName);
            svc.setURL(serviceUrl);

            return;
        },
        parseResponse: function (svc, client) {
            var res = JSON.parse(client.text);
            return res;
        },
        getResponseLogMessage: function (response) {
            return !empty(response.getText()) ? response.getText() : 'Response is empty.';
        },
    }),
}