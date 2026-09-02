'use strict';

const Status = require('dw/system/Status');
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;
const errorHandler = require('app_composable/cartridge/scripts/helpers/util/errorHandler.js').errorHandler;

/**
 * Hook to create shopper context based on client id.
 * @param {*} usid 
 * @param {*} siteId 
 * @param {*} shopperContext 
 * @returns 
 */
exports.beforePUT = function (usid, siteId, shopperContext) {
    const validationsUtil = require('app_composable/cartridge/scripts/helpers/util/validationsUtil.js'); 
    const clientId = request.httpParameters['c_client_id']!= null && request.httpParameters['c_client_id'][0] !=null ? 
    request.httpParameters['c_client_id'][0] : request.clientId;

    if (!validationsUtil.getShopperContextFlag()){
        return new Status(Status.OK);
    }

    try {
        const shopperContextError= validationsUtil.validateContext(clientId, shopperContext);

        if (!empty(shopperContextError)) {
            throw new errorHandler.error('VALIDATE-FIELD-04-012', `${shopperContextError.join(', ')}`);
        }

    } catch (e) {
        logHandler.logger.error(e, 'Hooks', 'shopperContext');
        return new Status(Status.ERROR, 'ERROR', e.message);
    }

    return new Status(Status.OK);
};
