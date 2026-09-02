const Site = require('dw/system/Site');
const errorHandler = require('app_composable/cartridge/scripts/helpers/util/errorHandler.js').errorHandler;
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;

/**
 * Functions used in the One Trust Helper
 * @namespace OneTrustHelper
 */

/**
 * Uses customer profile to create DNSR payload
 * @function createDNSRPayload
 * @memberof OneTrustHelper
 * @returns {object} Returns DSNR service payload
 */
function createDNSRPayload() {
    var locale = Site.getCurrent().getDefaultLocale();
    return {
        language: locale && locale.toLowerCase().replace('_', '-'),
        email: customer.profile.email,
        requestTypes: ['Confirm'],
        subjectTypes: ['Customer'],
        multiselectFields: {
            formField20: ['NA'],
            formField18: ['NA'],
            formField22: ['NA']
        },
        additionalData: {
            formField23: 'NA'
        }
    }
}

/**
 * Creates and submits customer DSNR to one trust and flags the account with success or failure (isOneTrustDNSReqSubmitted)
 * @function createDNSRPayload
 * @memberof OneTrustHelper
 * @returns {void} Returns no data
 */
function submitDNSR() {
    try {
        if (customer.registered) {
            const payload = createDNSRPayload();
            const oneTrustService = require('app_composable/cartridge/scripts/services/oneTrust');
            const resp = oneTrustService.service.call(payload);
            customer.profile.custom.isOneTrustDNSReqSubmitted = resp.ok;
            if (!resp.ok) {
                throw new errorHandler.error('ONETRUST-DNSR-05-002', customer.ID);
            }
        } else {
            throw new errorHandler.error('ONETRUST-DNSR-05-002', customer.ID);
        }
    } catch (e) {
        logHandler.logger.error(e, 'One Trust', 'DNSR');
    }
}

module.exports = {
    submitDNSR
}
