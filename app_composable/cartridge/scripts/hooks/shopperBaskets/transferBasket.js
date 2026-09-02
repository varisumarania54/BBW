/**
 * TransferBasket
 * @namespace TransferBasket
 */
 'use strict';
 const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;
 const BopisHelper = require('app_composable/cartridge/scripts/helpers/objects/BasketComponents/BopisHelper.js');
 /**
  * Returns banner if basket was merged
  * @function afterTransfer
  * @memberof transferBasket
  * @param {Basket} basket - Basket after transfer
  * @return {Object} objects that contains a type error and text holding the reason message
  */
 exports.afterTransfer = function(basket){
     try{
         BopisHelper.handlePreferredStore('mergeBasket',basket.custom.preferredStore)
         basket.custom.cartStateString= '';
     }
     catch(e){
         logHandler.logger.error(e, 'Hooks', 'basketTransfer');
     }
 }
