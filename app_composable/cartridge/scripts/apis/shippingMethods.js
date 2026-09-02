const errorHandler = require('app_composable/cartridge/scripts/helpers/util/errorHandler.js').errorHandler;
const shippingMethodsHelper = require('app_composable/cartridge/scripts/helpers/shopperBaskets/getShippingMethodsForShipmentHelper.js')
const BasketMgr = require('dw/order/BasketMgr');


/**
 * @namespace ShippingMethods
 */
exports.get = {

    /**
     * Retrieves information about inapplicable shipping methods for a given basket shipment.
     *
     * @param {Object} params - The parameters object.
     * @param {string} [params.c_shipment] - Optional parameter specifying the shipment ID to evaluate.
     *                                       If not provided, the default shipment of the current basket is used.
     * @returns {Object} An object containing:
     *                   - `inapplicableMethods`: An array of inapplicable shipping methods, each including details such as id, name, description, and custom fields.
     *                   - `errorMsg`: An error message string, empty if no error occurred.
     *                   - `status`: The status code, typically 200 for success or 400 for errors.
     * @throws {Error} If there is an error in retrieving inapplicable shipping methods.
     */
    getInapplicableShippingMethodsInfo: function (params) {
        let result = {inapplicableMethods: [], errorMsg: 'Invalid Basket', status: 400};
        const basket = BasketMgr.getCurrentBasket();
        if (!basket) {
            return result;
        }
        let shipment = basket.defaultShipment;
        if (params.c_shipment) {
            shipment = basket.shipments.toArray().find(e => e.ID === params.c_shipment);
        }

        result.inapplicableMethods = shippingMethodsHelper.inapplicableMethods(shipment);

        result.errorMsg = '';
        result.status = 200;

        if (!empty(result.errorMsg)) {
            throw new errorHandler.newError('Update Customer Payment Error: ', result.errorMsg, result.status, 'shippingMethods.js', '','');
        }

        return result;
    }
}
