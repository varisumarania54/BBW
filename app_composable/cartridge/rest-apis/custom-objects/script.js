const apiUtils = require('app_composable/cartridge/scripts/apiUtils.js');
const customObjectHelper = require('app_composable/cartridge/scripts/helpers/objects/customObjects.js');
const Log = require('dw/system/Logger');
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;
const cacheTTLManager = require('app_composable/cartridge/scripts/helpers/util/cacheTTLManager.js');

/**
 * This SCAPI CUSTOM API endpoint is used to look up Custom Objects
 */
exports.getCustomObjects = function () {
    try {
        const type = request.httpParameters.get("c_type")[0];
        const response = customObjectHelper.getCustomObjects(type);
        apiUtils.createResponse(200, response);
        cacheTTLManager.setResponseTTL();
    } catch (e) {
        apiUtils.createErrorResponse(e);
        logHandler.logger.error(e, 'CustomAPI', 'CustomObject');
    }
};

exports.getCustomObjects.public = true;