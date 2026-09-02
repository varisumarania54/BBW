'use strict'
const CacheMgr = require('dw/system/CacheMgr');
const ShippingMgr = require('dw/order/ShippingMgr');
/**
 * @namespace ShippingHelper
 */


/**
 * Returns applicable shipping prices based on the thresholds set in bizman
 * @function getApplicableShippingPriceing
 * @memberof ShippingHelper
 * @returns {Object}
 */
function getApplicableShippingPriceing() {
    const cache = CacheMgr.getCache('shippingSurchargeComp');
    const cachedValue = cache.get('data');
    let dataModal;
    if(!empty(cachedValue)){
        dataModal = cachedValue;
    }
    else{
        const shippingPriceThresholds = 'shippingPriceThresholds' in dw.system.Site.current.preferences.custom && !empty(dw.system.Site.current.preferences.custom.shippingPriceThresholds) ? dw.system.Site.current.preferences.custom.shippingPriceThresholds : null;
        if(!empty(shippingPriceThresholds)){
            shippingPriceThresholds.sort((a,b)=>a-b);
        }
        dataModal = {};
        ShippingMgr.getAllShippingMethods().toArray().forEach(shipMethod=>{
            let alreadyRecorded=[];
            dataModal[shipMethod.ID] = [];
            if(shippingPriceThresholds){
                shippingPriceThresholds.forEach(threshold => {
                    let cost = ShippingMgr.getShippingCost(shipMethod, new dw.value.Money(threshold, 'USD'))
                    if(alreadyRecorded.indexOf(cost)==-1 ){
                        dataModal[shipMethod.ID].push({threshold: threshold.toFixed(2), price: cost.value })
                    }
                });
            }
        });
        cache.put('data',dataModal);
    }
    return dataModal;
}

module.exports = {
    getApplicableShippingPriceing
}
