const StringUtils = require("dw/util/StringUtils");
const errorHandler = require('app_composable/cartridge/scripts/helpers/util/errorHandler.js').errorHandler;
const bondHelper = require('int_bond/cartridge/scripts/bond/helpers/bondHelper.js');
const loyaltyHelper = require('app_composable/cartridge/scripts/helpers/loyalty/loyaltyHelper.js').loyaltyHelper;
const pointsHistoryHelper = require('app_composable/cartridge/scripts/helpers/loyalty/pointsHistoryHelper.js').pointsHistoryHelper;
const Site = require('dw/system/Site');

/**
 * Loyalty Data
 */
exports.post = {
    getOffers: function (c_slasjwt) {
        let errorMsg, result = { 'status': 400 };

        if (!empty(c_slasjwt)) {
            if (!empty(customer) && !empty(customer.profile)) {
                let customerProfile = customer.profile;
                let loyaltyIdValue = customerProfile.custom.loyaltyID || customerProfile.custom.bondLoyaltyId;

                if (!empty(loyaltyIdValue)) {
                    let bondData = bondHelper.getBondMember({ 'loyaltyMemberId': loyaltyIdValue });
                    if (!empty(bondData)) {
                        loyaltyHelper.getOffers(customerProfile, loyaltyIdValue, c_slasjwt, bondData);                        
                        loyaltyHelper.updateProfileWithBondData(customerProfile, bondData);
                        result.loyaltyOffersLastUpdated = customerProfile.custom.loyaltyOffersLastUpdated;
                        result.status = 200;
                    } else {
                        errorMsg = StringUtils.format('No loyalty account found for {0}', loyaltyIdValue);
                    }
                } else {
                    errorMsg = StringUtils.format('No loyalty account found for {0}', customer.ID);
                }
            } else {
                errorMsg = StringUtils.format('Error with customer / profile');
            }

            if (!empty(errorMsg)) {
                throw new errorHandler.newError('Loyalty Error', errorMsg, result.status, 'loyalty.js');
            }
        } else {
            errorMsg = StringUtils.format('Slas JWT not available');
        }

        if (!empty(errorMsg)) {
            throw new errorHandler.newError('Loyalty Error', errorMsg, result.status, 'loyalty.js');
        }

        return result;
    },
    activateOffer: function (emailHash, offerId) {
        let errorMsg, result = {
            status: 400
        }

        let profile;
        // if emailHash is present in body and user is not logged In
        if (empty(emailHash) && !empty(customer) && customer.isRegistered() && customer.isAuthenticated()) {
            profile = !empty(customer) && !empty(customer.profile) ? customer.getProfile() : null;
        } else if (!empty(emailHash)) {
            profile = loyaltyHelper.searchProfileByEmailHash(emailHash);
        }

        if (!empty(profile)) {
            const customAttributes = profile.getCustom();
            const bondLoyaltyId = 'bondLoyaltyId' in customAttributes && customAttributes.bondLoyaltyId;
            const loyaltyId = 'loyaltyID' in customAttributes && customAttributes.loyaltyID;
            let loyaltyMemberId = bondLoyaltyId || loyaltyId;
            if (!loyaltyMemberId) {
                errorMsg = `Customer ${customer.ID} is not a loyalty member`;
                throw new errorHandler.newError('Activate Offer Error', errorMsg, result.status, 'loyalty.js');
            }
            // get offer Info profile Filtered Offers
            const offerData = loyaltyHelper.getOfferInfoFromProfile(profile, offerId);
            if (!empty(offerData.offerInfo)) {
                if (offerData.isExpired) {
                    errorMsg = 'Offer is expired';
                    throw new errorHandler.newError('Activate Offer Error', errorMsg, result.status, 'loyalty.js');
                }
                if (offerData.offerInfo.optIn) {
                    errorMsg = 'Offer Already activated';
                    throw new errorHandler.newError('Activate Offer Error', errorMsg, result.status, 'loyalty.js');
                }
            } else {
                errorMsg = 'Offer ID not found on profile';
                throw new errorHandler.newError('Activate Offer Error', errorMsg, result.status, 'loyalty.js');
            }

            let activateOfferResponse;
            // make call to bond only if offer id is part of customer's bonus offers
            if (loyaltyMemberId && offerId && offerData.offerInfo) {
                let params = {
                    loyaltyMemberId: loyaltyMemberId,
                    offerId: offerId,
                    emailHash: emailHash,
                    loggedIn: profile.getCustomer().isAuthenticated(),
                    requestFrom: 'web'
                }
                // activate given offer Id for the given customer's loyaltyID
                activateOfferResponse = bondHelper.activateOffer(params);
                if (!empty(activateOfferResponse) && activateOfferResponse.optInFl) {
                    result.status = 200;
                    result.optInFl = activateOfferResponse.optInFl;
                    loyaltyHelper.setBonusOptInTrue(params, profile);
                } else {
                    errorMsg = `Unable to activate offer ID`;
                    throw new errorHandler.newError('Activate Offer Error', errorMsg, 500, 'loyalty.js');
                }
            }
        } else {
            errorMsg = `Customer not found with Email Hash ${emailHash}`;
            throw new errorHandler.newError('Activate Offer Error', errorMsg, result.status, 'loyalty.js');
        }
        return result;
    }
}

exports.get = {
    pointsHistory: function (pagenum) {
        if (!customer.isRegistered() && !customer.isAuthenticated()) {
            throw new Error('Unauthenticated customer');
        }
        const customAttributes = customer.getProfile().getCustom();
        const bondLoyaltyId = 'bondLoyaltyId' in customAttributes && customAttributes.bondLoyaltyId;
        const loyaltyId = 'loyaltyID' in customAttributes && customAttributes.loyaltyID;
        const loyaltyMemberId = bondLoyaltyId || loyaltyId;
        if (!loyaltyMemberId) {
            throw new Error(`Customer ${customer.ID} is not a loyalty member`);
        }
        const maxRecordsPerPage = Site.getCurrent().getCustomPreferenceValue('pointsHistoryMaxRecordsPerPage');
        const skip = pagenum > 1 ? (pagenum - 1) * maxRecordsPerPage : 0;
        const pointsHistory = bondHelper.getBondMemberPointsHistory({ loyaltyMemberId, skip, maxRecordsPerPage });
        if ('ok' in pointsHistory && !pointsHistory.ok) {
            throw new Error(`Service bond.members.points.history.get: ${pointsHistory.status}, ${pointsHistory.error}`);
        }
        return pointsHistoryHelper.pointsHistoryModel(pointsHistory, pagenum, maxRecordsPerPage);
    }
}
