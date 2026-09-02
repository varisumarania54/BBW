'use strict';
const ArrayList = require("dw/util/ArrayList");
const Mail = require("dw/net/Mail");
const HashMap = require("dw/util/HashMap");
const Template = require("dw/util/Template");
const SitePrefs = dw.system.Site.getCurrent();
const CustomerServiceEmail = SitePrefs.getCustomPreferenceValue("customerServiceEmail");
const CCHomePage = SitePrefs.getCustomPreferenceValue("CustomerCareHomePage");
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;

/**
 * @namespace mailHelper
 */

/**
 * Dynamic hanlder for email sending
 * @function sendMailwRender
 * @param {string} templateName the template used for email body
 * @param {string} toEmail the email to send to
 * @param {Object} emailParams json object to loop through to add accessible data to email body
 */
function sendMailwRender(templateName, toEmail, emailParams) {
    try {
        let email = new Mail();
        let customerCareLink = CCHomePage + request.locale.replace('_', '-').toLocaleLowerCase();
        emailParams.fromEmail = emailParams.fromEmail || CustomerServiceEmail;
        emailParams.ccHomePage = emailParams.ccHomePage || customerCareLink;
        email.setTo(new ArrayList(toEmail));
        email.setFrom(emailParams.fromEmail);
        email.setSubject(emailParams.subject);
        const emailTemplate = new Template(`composable/mail/${templateName}`);
        let map = new HashMap();
        let params = emailParams;
        if (!empty(params)) {
            for (let p in params) {
                map.put(p, params[p]);
            }
        }
        const emailContent = emailTemplate.render(map).text;
        email.setContent(emailContent, 'text/html', 'UTF-8');
        return email.send();
    } catch (e) {
        logHandler.logger.warn(`sendMailwRender Error - ${e}`);
    }
}

/**
 * Sets locale resources based on shopper context locale
 * @function setResourceLocale
 * @returns {void}
 */
function setRequestLocale() {
    if ('locale' in session.custom && typeof session.custom.locale === 'string') {
        request.setLocale(session.custom.locale);
    }
}

module.exports = {
    sendMailwRender,
    setRequestLocale
}
