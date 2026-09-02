/**
 * Custom account api methods
 * @namespace account
 */
const CustomerMgr = require('dw/customer/CustomerMgr');
const dataValidation = require('app_composable/cartridge/scripts/helpers/util/dataValidation.js').dataValidation;
const errorHandler = require('app_composable/cartridge/scripts/helpers/util/errorHandler.js').errorHandler;
const CustomObjectMgr = require('dw/object/CustomObjectMgr');

exports.get = {
    /**
     * This function takes email as input param, checks if an account exists for given email
     * @function checkAccount
     * @memberof account
     * @param {string} email - email in string format
     * @return {Object} {
            "alreadyRegistered": true/false,
            "loyaltyCustomer": true/false,
            "posRegistered": true/false
        }
     *
     */
    checkAccount: function (email) {
        let errorMsg;
        const response = {
            "alreadyRegistered": false,
            "loyaltyCustomer": false,
            "posRegistered": false
        };
        if (empty(email) || !dataValidation.isValidEmail(email)) {
            errorMsg = 'InValid Email';
            throw new errorHandler.newError('Check Account Error', errorMsg, 400, 'checkAccount.js');
        } else {
            // check if there is a account with given email
            const customer = CustomerMgr.getCustomerByLogin(email);
            if (!empty(customer)) {
                const profile = customer.getProfile();
                if (!empty(profile)) {
                    response.alreadyRegistered = true;
                    response.posRegistered = profile.custom.bondCustomerLoyaltySubStatus === 'POSPending' &&
                                             profile.custom.mustChangePassword === true;
                    if (profile.custom.bondLoyaltyId) {
                        response.loyaltyCustomer = true;
                    }
                } else {
                    errorMsg = `Profile Not found for ${email}`;
                    throw new errorHandler.newError('Check Account Error', errorMsg, 404, 'checkAccount.js');
                }
            }
        }
        return response;
    },
    /**
     * This function takes emailToken and validates custom object then returns customer form data
     * @function getAccountInfo
     * @memberof account
     * @param {string} emailToken - emailHash hexidecimal value
     * @return {Object} {
            email: "pos.pending@bbw.com",
            firstName: "Jane",
            lastName: "Smith",
            zipCode: "43147",
            mobile: "5555555555",
            birthDay: "1990-10-30T00:00:00.000Z"
        }
     *
     */
    getAccountInfo: function (emailToken) {
        const type = 'POSPasswordResetRequests';
        const validation = CustomObjectMgr.getCustomObject(type, emailToken);

        if (!validation) {
            throw new errorHandler.newError('Get Account Info Error', 'Not a valid reset password request', 404, 'account.js');
        }

        const { login } = validation.getCustom();
        const resetCustomer = CustomerMgr.getCustomerByLogin(login);
        if (!resetCustomer) {
            throw new errorHandler.newError('Get Account Info Error', `${login} is not valid account`, 404, 'account.js');
        }

        const profile = resetCustomer.getProfile();
        const { bondCustomerLoyaltySubStatus,
                mustChangePassword,
                loyaltyPostalCode } = profile.getCustom();

        const isPOSPendingAccount = bondCustomerLoyaltySubStatus === 'POSPending' && mustChangePassword === true;

        if (!isPOSPendingAccount) {
            throw new errorHandler.newError('Get Account Info Error', `${login} is not pos pending account`, 404, 'account.js');
        }

        return {
            email: profile.getEmail(),
            firstName: profile.getFirstName(),
            lastName: profile.getLastName(),
            zipCode: loyaltyPostalCode,
            mobile: profile.getPhoneHome(),
            birthDay: profile.getBirthday()
        };
    }
}
