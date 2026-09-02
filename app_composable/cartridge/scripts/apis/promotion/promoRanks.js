/**
 * Get Applicable promotions details with promotion ranks  
 * @namespace promotion
 */

/**
 * @function getPromotionsForCustomer
 * @memberof promotion
 * @returns {Array} all applicable promotions for a customer
 */
exports.getPromotionsForCustomer = function () {
    var promotions = dw.campaign.PromotionMgr.getActiveCustomerPromotions();


    var result = [];
    if (!empty(promotions.promotions)) {
        for (var i = 0; i < promotions.promotions.length; i++) {
            var promotion = promotions.promotions[i];
            var promotionResult = {};

            promotionResult.ID = promotion.ID;
            promotionResult.rank = promotion.rank;

            result.push(promotionResult);
        }

    }
    return result;
}

exports.getPromotionsForCustomer.public = true;
