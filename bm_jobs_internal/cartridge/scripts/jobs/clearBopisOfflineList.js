'use strict';

/**
 * Job Step: custom.ProcessBopisOrderLimits
 * @namespace clearBopisOfflineList
 */

const CustomObjectMgr = require('dw/object/CustomObjectMgr');
const Logger = require('dw/system/Logger');
const Status = require('dw/system/Status');

/**
 * Crawls BopisOrders and apply them to BopisStores
 * When the individual store threshold is exceed it turns the store off and sends the store an email noficiation
 * @function clearBopisOfflineList
 * @memberof clearBopisOfflineList
 * @param {dw.util.HashMap} args
 * @param {dw.job.JobStepExecution} stepExecution
 * @returns {dw.system.Status}
 */
function clearBopisOfflineList(args, stepExecution) {
    try {
        let disabledStores = CustomObjectMgr.getCustomObject('BopisOrderLimitsDisabledStoreList', 'BBW');
        if (empty(disabledStores)) {
            CustomObjectMgr.createCustomObject('BopisOrderLimitsDisabledStoreList', 'BBW');
        }
        else {
            if (!empty(disabledStores && 'storeIDsCSV' in disabledStores.custom && disabledStores.custom.storeIDsCSV)) {
                disabledStores.custom.storeIDsCSV = "";
            }
        }
    } catch (e) {
        Logger.error(e.message);
        return new Status(Status.ERROR, 'ERROR', e.message);
    }
}

module.exports = { clearBopisOfflineList }
