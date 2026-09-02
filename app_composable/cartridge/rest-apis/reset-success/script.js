const apiUtils = require('app_composable/cartridge/scripts/apiUtils.js');
const apiImplementation = require('app_composable/cartridge/scripts/apis/resetSuccess.js');
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;
const errorHandler = require('app_composable/cartridge/scripts/helpers/util/errorHandler.js').errorHandler;
const Site = require('dw/system/Site').getCurrent();

exports.resetSuccess = function () {
    try {
        const params = request.getHttpParameterMap();
        const id = params.isParameterSubmitted("c_id") ? params.get("c_id").getStringValue() : null;
        const emailToken = params.isParameterSubmitted("c_emailToken") ? params.get("c_emailToken").getStringValue() : null;

        if (id && emailToken) {
            throw new errorHandler.error('RESET-SUCCESS-04-001');
        }

        if(empty(id) && empty(emailToken)){
            throw new errorHandler.error('RESET-SUCCESS-04-002');
        }

        let resetCustomer = !empty(id) ?
                            apiImplementation.afterPasswordResetSuccess(id) :
                            apiImplementation.afterPOSPasswordResetSuccess(emailToken);

        if (Site.getCustomPreferenceValue('sendPasswordResetEmail')) {
            apiImplementation.sendPasswordChangedEmail(resetCustomer);
        }
        apiUtils.createResponse(200, {});
    } catch (e) {
        logHandler.logger.error(e, 'CustomAPI', 'resetSuccess');
        let httpCode = e.httpCode || 500;
        apiUtils.createError(httpCode, {
            title: e.name || 'Server error',
            type: e.type || 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/' + httpCode,
            detail: e.message || 'An unexpected error occurred while processing the request.'
        });
    }
};

exports.resetSuccess.public = true;
