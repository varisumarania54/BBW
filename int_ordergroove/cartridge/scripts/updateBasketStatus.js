'use strict';

/**
 * Update Ordergroove Customer baskets
 *
 * @module updateBasket
 *
 * @input Basket : Object
 * @input ARInput : String
 */


/**
 * Reserved function for pipeline compatibility
 * @param {Object} pdict - the pipeline dictionary
 * @returns {Object} The next pipelet
 */
function execute(pdict) { //eslint-disable-line
    
	var basket = pdict.Basket
	var ARProductObject = JSON.parse(pdict.ARInput);
	if(!empty(basket)){
		for each(var pli in basket.getProductLineItems()){
			if(pli.productID == ARProductObject.productId){
				pli.custom.isAutoRefreshSubscribedItem = ARProductObject.optedIn;
			}
		}
	}
    return PIPELET_NEXT; //eslint-disable-line
}

/* Module export for controllers */
module.exports = {
    execute: execute
};
