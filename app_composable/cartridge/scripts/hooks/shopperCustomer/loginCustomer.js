'use strict';

const Status = require('dw/system/Status');
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;
const errorHandler = require('app_composable/cartridge/scripts/helpers/util/errorHandler').errorHandler;
const enableCIAMCheck = require('app_composable/cartridge/scripts/helpers/integrations/CIAM/enableCIAMCheck');
/**
 * Hook reject login authorization if their profile contains mustChangePassword: true
 * @param {dw.customer.Customer} customer
 * @returns {Status}
 */
exports.afterPOST = function (customer : dw.customer.Customer) {
    try {
        // Checks if CIAM is enabled and throws error if true, preventing login via this hook.
        enableCIAMCheck.enableCIAMCheck('CIAM-01-003');

        if (request.isSCAPI() && customer.profile && customer.profile.custom && customer.profile.custom.mustChangePassword) {
            throw new errorHandler.error('Login-01-001');
        }
        return new Status(Status.OK);
    }
    catch (error) {
        logHandler.logger.error(error, 'Hooks', 'loginCustomer');
        return new Status(Status.ERROR, error.httpCode, error.message);
    }
}
