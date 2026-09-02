'use strict';

const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;
const AurusHelper = require('int_aurus_composable/cartridge/scripts/helpers/Aurus.js');
/**
 * Handle Aurus session operations
 * @param {Object} [payload] - Optional request payload for future use
 * @returns {Object} Response object
 */
function postAurusSession(payload) {
    const logger = logHandler.logger;
    try {
         return AurusHelper.initializeSession(payload);
    } catch (e) {
        logger.error(e, 'AurusSession', 'postAurusSession');
        throw e;
    }
}

module.exports = {
    postAurusSession
};
