'use strict'
/**
 * @module getSearchSuggestions.js
 * @namespace getSearchSuggestions
 */
var Status = require('dw/system/Status');

/**
 * @function modifyGETResponse
 * @memberof getSearchSuggestions
 * Modifies the Shopper Search GET suggestions response by appending popular
 * search phrases to custom suggestions.
 *
 * @param {Object} request - Shopper Search request payload.
 * @param {Object} doc - Shopper Search response document.
 * @returns {dw.system.Status} Hook execution status.
 */
exports.modifyGETResponse = function(request, doc){
    var SearchSuggest = require('app_composable/cartridge/scripts/helpers/search/searchSuggestHelpers.js');
    var suggest = SearchSuggest(request.query, 10);
    var suggestions = [];
    var suggestionList = suggest.popular.phrases
    while (suggestionList.hasNext()) {
        suggestions.push(suggestionList.next().getPhrase());
    }

    request.customSuggestions.c_popularSearches = suggestions;
    return new Status(Status.OK);
}
