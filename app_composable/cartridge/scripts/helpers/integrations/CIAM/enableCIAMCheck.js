/**
 * Checks if the enableCIAM site preference is set to true.
 * If true, throws an exception using the errorHandler.
 */
function enableCIAMCheck(errorCode) {
    const sitePrefHelper = require('app_composable/cartridge/scripts/helpers/util/sitePrefHelper');
    const errorHandler = require('app_composable/cartridge/scripts/helpers/util/errorHandler.js').errorHandler;
    const isCIAMEnabled = sitePrefHelper.getSitePrefValue('enableCIAM');

    if (isCIAMEnabled) {
        if (errorCode) {
            throw new errorHandler.error(errorCode);
        } else {
            throw new errorHandler.error('CIAM-01-001');
        }
    }
}

module.exports = {
    enableCIAMCheck
};
