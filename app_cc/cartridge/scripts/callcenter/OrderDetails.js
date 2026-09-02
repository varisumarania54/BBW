/**
 *  Getting order details from Radial API
*   @input OrderID : String Order number (orderNo)
*   @output OrderDetails : Object
*   @output OrderDetailsError : String
*
*/
importPackage( dw.system );

function execute( args : PipelineDictionary ) : Number
{
    var RadialHelper = require('app_radial/cartridge/scripts/RadialHelper.js').RadialHelper;
    var OrderService = require('app_radial/cartridge/scripts/order/OrderService.js').OrderService;

    try{
        var orderDetails = {}; 
		var result = OrderService.history.details(args.OrderID);
		if(result != null){
		    orderDetails = result;
		}
		args.OrderDetails = orderDetails;
    }catch(e){
        RadialHelper.logger.error(e, 'orderstatus');
        args.OrderDetailsError = e.message;
        return PIPELET_ERROR;
    }
    return PIPELET_NEXT;
}
