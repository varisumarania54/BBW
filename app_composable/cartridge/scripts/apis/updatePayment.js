const errorHandler = require('app_composable/cartridge/scripts/helpers/util/errorHandler.js').errorHandler;
const CustHelper = require('app_composable/cartridge/scripts/helpers/objects/customer');

/**
 * @namespace PaymentInstruments
 */
exports.post = {
    /**
     * Update Payment Info API
     * @function updatePaymentInfo
     * @param {Object} params - contains necessary api params, paymentinstrumentid, billingaddressid, setdefault
     * @returns {Object} contains error message and status
     */
    updatePaymentInfo: function (params) {
        let result = {errorMsg: 'Invalid Payment', status: 400, defaultCardUpdated: false, addressChanged: false};
        let piData = CustHelper.getExistingPIData(params.c_paymentInstrumentId);

        if (!empty(piData)) {
            let isDefaultCard = CustHelper.isDefaultCard(params.c_paymentInstrumentId)
            if (params.c_defaultCard && !isDefaultCard) {
                result.defaultCardUpdated = CustHelper.setDefaultCard(params.c_paymentInstrumentId);
            }
            
            if (CustHelper.isSavedAddress(params.c_billingAddressId)) {
                result.addressChanged = piData.custom.BillingAddressID != params.c_billingAddressId;
                piData.custom.BillingAddressID = params.c_billingAddressId;
            }

            result.errorMsg = '';
            result.status = 200;
        }
        
        if (!empty(result.errorMsg)) {
            throw new errorHandler.newError('Update Customer Payment Error: ', result.errorMsg, result.status, 'updatePayment.js', '','');
        }

        return result;
    }
}