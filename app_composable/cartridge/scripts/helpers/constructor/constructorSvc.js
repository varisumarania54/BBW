'use strict';

const LocalServiceRegistry = require('dw/svc/LocalServiceRegistry');

/**
 * Constructor.io HTTP service.
 * The service ID 'constructor.http.search' must be configured in
 * Business Manager → Administration → Operations → Services with the
 * base URL set to https://pwcdauseo-zone.cnstrc.com
 *
 * Call via: constructorSvc.search.call(params)
 * where params = { pageSize, offset, cgid, q, storeId, filters, sort, clientId, sessionId }
 * Returns a dw.svc.Result; result.object is
 * { productIds, facets, sort_options, total_num_results } on success.
 */
module.exports = {
    search: LocalServiceRegistry.createService('constructor.http.search', {
        createRequest: function (svc, params) {
            const Site = require('dw/system/Site').getCurrent();
            const indexKey = Site.getCustomPreferenceValue('Constructor_ApiKey');
            const inventory = Site.getCustomPreferenceValue('WebInventoryListId');
            const limitMultiplier = Site.getCustomPreferenceValue('ConstructorSearchMultipler');
            const useFSOFilter = Site.getCustomPreferenceValue('ConstructorFSOPrefilter');
            const limit = Math.floor(params.pageSize * limitMultiplier);

            // Query parameters — array of pairs to support repeated keys (e.g. filters[], fmt_options[]).
            const queryParams = [
                ['c', 'ciojs-client-2.62.6'],
                ['key', indexKey],
                ['offset', String(params.offset || 0)],
                ['num_results_per_page', String(limit)],
                ['fmt_options[hidden_fields]', 'searchable'],
                ['fmt_options[hidden_fields]', 'availability.' + inventory],
                ['_dt', String(Date.now())]
            ];

            /** @type {{ and: any[] }} */
            const preFilterExpression = { and: [] };

            if (useFSOFilter) {
                const now = Date.now();
                const future = new Date("2099-02-21T05:00:00.000Z").getTime();
                const past = new Date("2000-02-21T05:00:00.000Z").getTime();
                preFilterExpression.and.push({
                    not: {
                        and: [
                            { name: 'searchableIfUnavailable', value: 'False' },
                            { name: 'c_forceSoldOutStartTime', range: [past, now] },
                            { name: 'c_forceSoldOutEndTime', range: [now, future] }
                        ]
                    }
                });
            }

            preFilterExpression.and.push({ name: 'webStoreInventory', value: inventory });
            if (params.storeId) {
                const fullStoreId = String(params.storeId).padStart(5, '0').padStart(8, 'BBW');
                preFilterExpression.and.push({ name: 'webStoreInventory', value: fullStoreId });
            }

            queryParams.push(['pre_filter_expression', JSON.stringify(preFilterExpression)]);

            // Constructor user tracking params — only added when the client provides them.
            if (params.clientId) {
                queryParams.push(['i', params.clientId]);
            }
            if (params.sessionId) {
                queryParams.push(['s', String(params.sessionId)]);
            }

            if (params.storeId) {
                queryParams.push(['filters[webStoreInventory]', params.storeId]);
                queryParams.push(['fmt_options[hidden_fields]', 'availability.' + params.storeId]);
            }

            // The c_sort value is a compound ID: "sort_by" or "sort_by:sort_order".
            if (params.sort) {
                const sortParts = params.sort.split(':');
                queryParams.push(['sort_by', sortParts[0]]);
                if (sortParts.length > 1) {
                    queryParams.push(['sort_order', sortParts[1]]);
                }
            }

            // Append filters as Constructor filter params.
            // "productType=3-Wick Candles" becomes filters[c_productType]=3-Wick Candles.
            if (params.filters) {
                const filterParts = params.filters.split('|');
                for (let f = 0; f < filterParts.length; f++) {
                    let eqIdx = filterParts[f].indexOf('=');
                    if (eqIdx > -1) {
                        let attrId = filterParts[f].substring(0, eqIdx).trim();
                        let attrValue = filterParts[f].substring(eqIdx + 1).trim();
                        if (attrId && attrValue) {
                            queryParams.push(['filters[c_' + attrId + ']', attrValue]);
                        }
                    }
                }
            }

            const queryString = queryParams
                .map(function (pair) {
                    return encodeURIComponent(pair[0]) + '=' + encodeURIComponent(pair[1]);
                })
                .join('&');

            const urlPath = params.q
                ? '/search/' + encodeURIComponent(params.q) + '?' + queryString
                : '/browse/group_id/' + encodeURIComponent(params.cgid) + '?' + queryString;

            const url = svc.getURL() + urlPath;
            svc.setRequestMethod('GET');
            svc.setURL(url);
            svc.addHeader('Accept', 'application/json');
            return null;
        },

        parseResponse: function (svc, client) {
            const Logger = require('dw/system/Logger');
            if (client.statusCode === 200) {
                try {
                    const parsed = JSON.parse(client.text);
                    const response = parsed.response;
                    const productIds = (response.results || []).map(function (r) { return r.data.id; }).join(',');

                    return {
                        productIds: productIds,
                        facets: response.facets || [],
                        sort_options: response.sort_options || [],
                        total_num_results: response.total_num_results || 0
                    };
                } catch (e) {
                    Logger.getLogger('CustomAPI_constructor', 'error').error(
                        'Constructor parse error: ' + e.message + ' | url: ' + svc.getURL()
                    );
                    return null;
                }
            }
            Logger.getLogger('CustomAPI_constructor', 'error').error(
                'Constructor HTTP ' + client.statusCode + ' | url: ' + svc.getURL()
            );
            return null;
        }
    })
};
