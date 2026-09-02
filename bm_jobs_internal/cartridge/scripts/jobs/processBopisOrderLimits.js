'use strict';

/**
 * Job Step: custom.ProcessBopisOrderLimits
 * @namespace ProcessBopisOrderLimits
 */

const CustomObjectMgr = require('dw/object/CustomObjectMgr');
const HashMap = require('dw/util/HashMap');
const List = require("dw/util/ArrayList");
const Logger = require('dw/system/Logger');
const Mail = require('dw/net/Mail');
const Resource = require('dw/web/Resource');
const Status = require('dw/system/Status');
const Template = require('dw/util/Template');
const StoreMgr = require('dw/catalog/StoreMgr');
const GetStoreInventoryList = require('app_composable/cartridge/scripts/helpers/global/BopisOrderLimits.js').getStoreInventoryList;

/**
 * Crawls BopisOrders and apply them to BopisStores
 * When the individual store threshold is exceed it turns the store off and sends the store an email noficiation
 * @function sendEmail
 * @memberof ProcessBopisOrderLimits
 * @param {String} mailTo
 * @param {String} mailCc
 * @param {String} mailFrom
 * @param {Number} limit
 * @param {Array} localeCodes
 * @param {String} storeId
 * @param {dw.job.JobStepExecution} stepExecution
 * @returns {dw.system.Status}
 */
function sendEmail(mailTo, mailCc, mailFrom, limit, localeCodes, storeId) {
    let email = new Mail();
    email.setTo(new List([mailTo]));
    email.setFrom(mailFrom);

    if (mailCc) {
        email.setCc(new List([mailCc]));
    }
    let limits = [];
    let messages = [];
    let subjects = [];
    let titles = [];

    for (let l in localeCodes) {
        request.setLocale(localeCodes[l]);
        limits.push(Resource.msgf('orderlimit.limits', 'mail', null, limit));
        messages.push(Resource.msgf('orderlimit.message', 'mail', null, storeId));
        titles.push(Resource.msg('orderlimit.title', 'mail', null));
        subjects.push(Resource.msgf('orderlimit.subject', 'mail', null, storeId));
    }

    email.setSubject(subjects.join(' | '));

    let content = new HashMap();
    content.put('limits', limits);
    content.put('messages', messages);
    content.put('titles', titles);
    let template = new Template(`storeorderlimit`);
    let body = template.render(content).text;

    email.setContent(body, 'text/html', 'UTF-8');
    email.send();
}

/**
 * Crawls BopisOrders and apply them to BopisStores
 * When the individual store threshold is exceed it turns the store off and sends the store an email noficiation
 * @function processBopisOrderLimits
 * @memberof ProcessBopisOrderLimits
 * @param {dw.util.HashMap} args
 * @param {dw.job.JobStepExecution} stepExecution
 * @returns {dw.system.Status}
 */
function processBopisOrderLimits(args, stepExecution) {
    try {
        const mailCc = args['mailCc'];
        const mailFrom = args['mailFrom'];
        const mailToPattern = args['mailToPattern'];
        const MockEmail = args['MockEmail'];
        const EnableMockEmail = args['EnableMockEmail'];
        const UseInventoryListID = args['UseInventoryListID'];
        const localeCodes = args['localeCodes'] != null ? args['localeCodes'].split(',') : [];
        const orders = CustomObjectMgr.getAllCustomObjects('BopisOrders');
        const disabledStores = dw.object.CustomObjectMgr.getCustomObject('BopisOrderLimitsDisabledStoreList', 'BBW');
        while (orders.hasNext()) {
            let order = orders.next();
            let storeId = order.custom.storeId;
            let store = CustomObjectMgr.getCustomObject('BopisStores', storeId);
            let storeObj = StoreMgr.getStore(storeId);
            if (store != null) {
                store.custom.OrderQty = store.custom.OrderQty + 1;

                if (store.custom.OrderQty >= store.custom.OrderLimit && !store.custom.bopisLimitReached) {
                    store.custom.bopisLimitReached = true;
                    if (disabledStores && (empty(disabledStores.custom.storeIDsCSV) || disabledStores.custom.storeIDsCSV.indexOf(storeId) == -1)) {
                        disabledStores.custom.storeIDsCSV = empty(disabledStores.custom.storeIDsCSV) ? storeId : disabledStores.custom.storeIDsCSV + "," + storeId;
                    }
                    Logger.info(`Store ${store.custom.storeId} has been disabled.`);

                    let storeIdSanatized = UseInventoryListID ? GetStoreInventoryList(storeObj).ID : parseInt(storeId.replace('BBW', ''));
                    let mailTo = EnableMockEmail ? MockEmail : mailToPattern.replace('*', storeIdSanatized);
                    let limit = store.custom.OrderLimit;

                    sendEmail(mailTo, mailCc, mailFrom, limit, localeCodes, storeId);
                    Logger.info(`Email notification sent. TO: ${mailTo} & CC: ${mailCc}`);
                }

            } else {
                Logger.error('Could not find a valid BopisStore custom object for storeId: ' + storeId);
            }
            CustomObjectMgr.remove(order);

        }

        orders.close();
        return new Status(Status.OK);

    } catch (e) {
        return new Status(Status.ERROR, 'ERROR', e.message);
    }
}

module.exports = { processBopisOrderLimits }
