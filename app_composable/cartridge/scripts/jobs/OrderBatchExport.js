'use strict';
const Status = require('dw/system/Status');
const OrderMgr = require('dw/order/OrderMgr');
const Logger = require('dw/system/Logger');
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;
const log = Logger.getLogger('radial-orderstatus', 'orderstatus');
const orderHelper = require('int_radial_composable/cartridge/scripts/rom/order/createOrderHelper.js');
exports.OrderBatchExport = function (params, stepExecution) {

    // script modules must be imported inside the job function

    const ghostOrderStatus = dw.order.Order[params.ghostOrderStatus];
    const orderStatusCancelled = dw.order.Order.ORDER_STATUS_CANCELLED;

    // Query string builders
    let queryString = statusQuery(params.excludeQuery, params.includeQuery);
    let dateQueryString = dateQuery(params.orderQueryStart, params.orderQueryEnd, params.hourOffsetQuery);

    // Ghost order query string
    if (!empty(params.includeGhostOrders)) {
        queryString += ' AND (custom.exportRetryReached = NULL OR custom.exportRetryReached = ' + params.includeGhostOrders + ')';
    }

    // Optional date query string
    if (!empty(dateQueryString)) {
        queryString += ' AND (' + dateQueryString + ')';
    }

    // Iterators to track how many orders have exported, failed, and retried
    let exportedOrders = 0, failedExports = 0, maxFailedExports = 0;

    // Order Mananger Processor
    OrderMgr.processOrders(callback, queryString);

    // // Summary of how the job performed
    logHandler.logger.info({message:'exported orders count: ' + exportedOrders }, 'Jobs', 'OrderExport');
    logHandler.logger.info({message:'failed to export orders count: ' + failedExports }, 'Jobs', 'OrderExport');
    logHandler.logger.info({message:'failed to export orders maximum retry count: ' + maxFailedExports }, 'Jobs', 'OrderExport');

    function callback(order: Order) {
        // regardless of success or failure we are tracking this export retry attempt
        order.custom.exportRetryCount = empty(order.custom.exportRetryCount) ? 1 : order.custom.exportRetryCount + 1;
        let maxOrderExportRetryReached = order.custom.exportRetryCount >= params.maxOrderExportRetries;
        try {

            // Undo Cancelled Ghost Orders
            if (order.getStatus() == orderStatusCancelled) {
                let undoStatus = OrderMgr.undoCancelOrder(order);
                if (undoStatus.isError()) {
                    logHandler.logger.info({message:'OrderBatchExportJob.js: orderNo:' + order.orderNo + ' - failed to undoCancelOrder (error response: ' + undoStatus.getMessage() + ')'}, 'Jobs', 'OrderExport');
                    failedExports++;
                    return;
                }
            }

            // Set request locale to customer locale if different from the last iteration
            if (request.locale !== order.customerLocaleID) {
                request.setLocale(order.customerLocaleID);
            }

            let exported = orderHelper.createOrderROM(order);
            if (exported) {
                exportedOrders++;
                logHandler.logger.info({message:'OrderBatchExportJob.js: orderNo:' + order.orderNo + ' - export successful' },'Jobs', 'OrderExport');
            } else {
                if (maxOrderExportRetryReached) {
                    order.custom.exportRetryReached = maxOrderExportRetryReached;
                    order.addNote('Max order export retries reached', 'This order failed export ' + order.custom.exportRetryCount + ' times. It can be considered a ghost order.');
                    if (order.getStatus() != ghostOrderStatus && ghostOrderStatus == orderStatusCancelled) {
                        OrderMgr.cancelOrder(order);
                    } else {
                        order.setStatus(ghostOrderStatus);
                    }
                    maxFailedExports++;
                    logHandler.logger.error({message:'OrderBatchExportJob.js: orderNo:' + order.orderNo + ' - max export tries reached' }, 'Jobs', 'OrderExport');
                } else {
                    failedExports++;
                    logHandler.logger.warn({message:'OrderBatchExportJob.js: orderNo:' + order.orderNo + ' - export failed, (current retries: ' + order.custom.exportRetryCount + ')' }, 'Jobs', 'OrderExport');
                }
            }

        } catch (e) {
            let error = !empty(e.fileName) && !empty(e.lineNumber) && !empty(e.message) ? e.fileName + ':' + e.lineNumber + ' - ' + e.message : 'Unkown Error';
            if (maxOrderExportRetryReached) {
                order.custom.exportRetryReached = maxOrderExportRetryReached;
                order.addNote('Max order export retries reached', 'This order failed export ' + order.custom.exportRetryCount + ' times. It can be considered a ghost order.');
                if (order.getStatus() != ghostOrderStatus && ghostOrderStatus == orderStatusCancelled) {
                    OrderMgr.cancelOrder(order);
                } else {
                    order.setStatus(ghostOrderStatus);
                }
                maxFailedExports++;
                logHandler.logger.error({message:'orderNo:' + order.orderNo + ' - max export failed issue: ' + error }, 'Jobs', 'OrderExport');
            } else {
                failedExports++;
                logHandler.logger.warn({message:'orderNo:' + order.orderNo + ' - export failed issue: ' + error } , 'Jobs', 'OrderExport');
            }


        }

    }
    return new Status(Status.OK);

}

function dateQuery(orderQueryStart, orderQueryEnd, hourOffsetQuery) {
    let cal = dw.system.Site.current.calendar;
    let dateQueryArray = [];
    let dateQueryRange = {
        'start':
        {
            'date': orderQueryStart,
            'operator': ' >= '
        },
        'end':
        {
            'date': orderQueryEnd,
            'operator': ' <= '
        }
    };
    for (let i in dateQueryRange) {
        let dateObj = dateQueryRange[i];
        let date = dateObj.date;
        let operator = dateObj.operator;
        if (!empty(date)) {
            cal.setTime(date);
            if (!empty(hourOffsetQuery) && hourOffsetQuery > 0) {
                cal.add(dw.util.Calendar.HOUR, (hourOffsetQuery * -1));
            }
            dateQueryArray.push('creationDate' + operator + cal.getTime().toISOString().replace(/.[^.]+$/, '+Z'));
        }
    }
    let dateQueryJoiner = (dateQueryArray.length > 1) ? ' AND ' : '';
    return dateQueryArray.join(dateQueryJoiner);
}

function statusQuery(excludes, includes) {
    let queryArray = [];
    if (!empty(excludes)) {
        excludes = excludes.split(',');
        for (let i in excludes) {
            let statusKey = (excludes[i].indexOf('EXPORT_STATUS') > -1) ? 'exportStatus' : 'status';
            queryArray.push(statusKey + ' != ' + dw.order.Order[excludes[i]]);
        }
    }
    if (!empty(includes)) {
        includes = includes.split(',');
        for (let i in includes) {
            let statusKey = (includes[i].indexOf('EXPORT_STATUS') > -1) ? 'exportStatus' : 'status';
            queryArray.push(statusKey + ' == ' + dw.order.Order[includes[i]]);
        }
    }
    let statusQueryJoiner = (queryArray.length > 1) ? ' AND ' : '';
    return queryArray.join(statusQueryJoiner);
}