/**
*   Retriving orders list from Radial OMS for registered customer
*   @input customerNo : String
*   @output Orders : dw.util.Iterator
*   @output OrdersCount : Number
*/
importPackage( dw.system );
importPackage( dw.util );

function execute( args : PipelineDictionary ) : Number
{
    var RadialHelper = require('app_radial/cartridge/scripts/RadialHelper.js').RadialHelper;
    var OrderService = require('app_radial/cartridge/scripts/order/OrderService.js').OrderService;

    try{
        var orders = new ArrayList();
        var customerID = RadialHelper.getBBWCustomerNumberPrefix() + args.customerNo;
        orders = OrderService.history.lookup(customerID); // 00032395348681
        args.Orders = orders.iterator();
        args.OrdersCount = orders.size();
    }catch(e){
        RadialHelper.logger.error(e, 'orderstatus');
        return PIPELET_ERROR;
    }
    return PIPELET_NEXT;
}
