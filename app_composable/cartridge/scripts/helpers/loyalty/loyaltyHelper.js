'use strict';

const ServiceHelper = require('int_loyalty/cartridge/scripts/helpers/ServiceHelper');
const dataValidation = require('app_composable/cartridge/scripts/helpers/util/dataValidation.js').dataValidation;
const bondHelper = require('int_bond/cartridge/scripts/bond/helpers/bondHelper.js');
const bondServices = require('int_bond/cartridge/scripts/bond/services/bondServices.js');
const System = require('dw/system/System');
const Site = require('dw/system/Site');
const CustomerMgr = require('dw/customer/CustomerMgr');
const Calendar = require('dw/util/Calendar');

/**
 * @namespace Loyalty
 */

let loyaltyHelper = {

    _constants: {
        offerTypes: {
            capped: 'CAP BENEFIT'
        }
    },
    isBondLoyaltyEnabled: function () { return dataValidation.validSitePref('isLoyaltyEnrollmentEnabled', false) },
    isLoyaltyEnrollmentEnabled: function () { return dataValidation.validSitePref('isLoyaltyEnrollmentEnabled', true) },
    //new service couponcrafter toggle
    isCouponHubEnabled: function () { return dataValidation.validSitePref('isCouponHubEnabled', false) },
    daysExpirationWarning: function () { return dataValidation.validSitePref('daysExpirationWarning', 1.0) },
    useSlasJWT: function () { return dataValidation.validSitePref('useSlasJWT', false) },
    useSlasMockService: function () { return dataValidation.validSitePref('useSlasMockService', false) },
    //specific loyalty logger for tracking in log center.
    getMaxNumberOfOffers: function () { return dataValidation.validSitePref('maxNumberOfOffers') },
    loyaltyLog: function () {
        let Logger = require('dw/system/Logger');
        let log = Logger.getLogger('rewards_program', 'loyalty');

        return log;
    },
    /**
     * Update SFCC customer profile attributes with Bond profile data
     * @function updateProfileWithBondData
     * @memberof Loyalty
     * @param {dw.customer.Profile} profile - customer profile
     * @param {Object} bondResponse - response from Bond service
     */
    updateProfileWithBondData: function (profile, bondResponse) {
        if (!empty(profile) && !empty(bondResponse) && 'loyaltyId' in bondResponse && !empty(bondResponse.loyaltyId)) {
            profile.custom.bondLoyaltyId = bondResponse.loyaltyId;
            profile.custom.loyaltyID = bondResponse.loyaltyId;
            profile.custom.bondLoyaltyStatus = bondResponse.loyaltyStatus;
            profile.custom.loyaltyMemberStatus = bondResponse.loyaltyStatus;
            profile.custom.bondCustomerLoyaltySubStatus = dataValidation.emptyCheck(bondResponse.subStatus, '');
            profile.custom.bondMarket = dataValidation.emptyCheck(bondResponse.market, '');
            profile.custom.bondConstruct = dataValidation.emptyCheck(bondResponse.construct, '');
            profile.custom.bondMemberID = bondResponse.id;

            // Save additional fields in profile
            if (!empty(bondResponse.firstName)) {
                profile.setFirstName(bondResponse.firstName);
            }

            if (!empty(bondResponse.lastName)) { //look to check inputs
                profile.setLastName(bondResponse.lastName);
            }

            profile.custom.loyaltyPostalCode = bondResponse.zipCode;

            if (!empty(bondResponse.phone)) {
                profile.setPhoneHome(bondResponse.phone);
            }

            let birthday = bondHelper.dobToDate(bondResponse.dateOfBirth)
            if (!empty(birthday)) {
               profile.setBirthday(birthday);
            }
        }

    },

    /**
     * Get updateMember service request body based on customer profile attributes
     * @function getUpdateMemberRequestBody
     * @memberof Loyalty
     * @param {dw.customer.Profile} customerProfile - customerProfile
     * @param {boolean} isPOSPendingFlow - boolean flag based on member subStatus
     * @return {Object} requestBody - return a request body object
     */
    getUpdateMemberRequestBody: function (customerProfile, isPOSPendingFlow) {
        let requestBody = {};

        if (!empty(customerProfile)) {
            let birthday = !empty(customerProfile.birthday) ? new Date(customerProfile.birthday) : null;
            let phone = !empty(customerProfile.phoneHome) ? customerProfile.phoneHome.replace(/\D+/g, '') : '';
            let zipCode = customerProfile.custom.loyaltyPostalCode ? customerProfile.custom.loyaltyPostalCode.substring(0, 5) : '';

            // For password change after POSPending
            let subStatus = !isPOSPendingFlow && !empty(customerProfile.custom.bondCustomerLoyaltySubStatus) ? customerProfile.custom.bondCustomerLoyaltySubStatus : '';

            requestBody = {
                firstName: customerProfile.firstName,
                lastName: customerProfile.lastName,
                email: customerProfile.email,
                phone: phone,
                zipCode: zipCode,
                loyaltyStatus: customerProfile.custom.bondLoyaltyStatus || '',
                subStatus: subStatus,
                updateChannel: Site.current.getCustomPreferenceValue('bondWebEnrollmentChannel')
            };

            if (!empty(birthday)) {
                requestBody.dateOfBirth = {
                    day: birthday.getDate(),
                    month: birthday.getMonth() + 1
                };
            }
        }

        return requestBody;
    },

    /**
     * Prepares the customer profile loyaly data and sets a last updated timestamp of last successful loyaly api call, then return that offer data
     * @function setFilteredData
     * @memberof Loyalty
     * @param {dw.customer.Profile} customerProfile
     * @param {offers} offers
     * @param {loyaltyStatus} loyaltyStatus
     * @return {object} - return customers loyalty data from profile after setting it to the profile
     */
    setFilteredData: function (customerProfile, offers, loyaltyStatus) {
        try {
            if (empty(offers) || empty(loyaltyStatus) || empty(customerProfile)) {
                return null;
            }

            let filteredData = this.prepareFilteredData(customerProfile, offers, loyaltyStatus);

            if (!empty(filteredData)) {
                customerProfile.custom.filteredOffers = JSON.stringify(filteredData);
                let memInfo = filteredData.LoyaltyDataSet.MemberStatusInfo

                if (!empty(memInfo.expiryDate)) {
                    customerProfile.custom.loyaltyExpiryDate = memInfo.expiryDate;
                }

                if (!empty(memInfo.statusChangeDate)) {
                    customerProfile.custom.statusChangeDate = memInfo.statusChangeDate;
                }

                if (!empty(memInfo.status)) {
                    customerProfile.custom.loyaltyMemberStatus = memInfo.status;
                }

                if (!empty(memInfo.anniversaryDate)) {
                    let anniversaryDate = memInfo.anniversaryDate;
                    customerProfile.custom.anniversaryDate = new Date(!empty(anniversaryDate) ? anniversaryDate : anniversaryDate.replace(/-/g, '/'));
                }

                customerProfile.custom.loyaltyOffersLastUpdated = Date.now().toString();

                return customerProfile.custom.filteredOffers;
            }
        } catch (e) {
            this.loyaltyLog().error('Customer Offers (customerId : ' + customerProfile.customerNo + ' ) Set Filtered Data Error: ' + e.message);
        }

        return null;
    },

    /**
     * Call updateMember service and return response
     * @function updateBondMember
     * @memberof Loyalty
     * @param {Object} params - parameters for updateMember call
     * @property {dw.customer.Customer} customer - customer
     * @property {boolean} isPOSPendingFlow - boolean flag based on member subStatus
     * @return {Object} - updateMemberResponse - updateMember service response
     */
    updateBondMember: function (params) {
        let updateMemberResponse;
        let token = bondHelper.getBondOauthToken();
        let loyaltyMemberId = !empty(params.customer) && !empty(params.customer.profile) ? params.customer.profile.custom.bondLoyaltyId || params.customer.profile.custom.loyaltyID : '';

        if (!empty(token) && !empty(loyaltyMemberId)) {
            let requestBody = this.getUpdateMemberRequestBody(params.customer.profile, params.isPOSPendingFlow);
            updateMemberResponse = bondServices.updateMember({
                token: token,
                loyaltyMemberId: loyaltyMemberId,
                requestBody: requestBody
            });
        }

        return updateMemberResponse;
    },

    /**
     * Call getMember service and return response
     * @function getBondMember
     * @memberof Loyalty
     * @param {Object} params - parameters for getMember call
     * @param {string} params.loyaltyMemberId - bond member ID for request URL
     * @return {Object} - getMemberResponse - getMember service response
     */
    getBondMember: function (params) {
        let getMemberResponse;
        let token = bondHelper.getBondOauthToken(params);

        if (!empty(token) && !empty(params.loyaltyMemberId)) {
            getMemberResponse = bondServices.getMember({
                token: token,
                loyaltyMemberId: params.loyaltyMemberId
            });
        }

        return getMemberResponse;
    },

    /**
     * Call getMemberPoints service and return response
     * @function getBondMemberPointsHistory
     * @memberof Loyalty
     * @param {Object} params - parameters for getMemberPoints call
     * @property {string} loyaltyMemberId - bond member ID for request URL
     * @return {Object} - getMemberPointsHistoryResponse - getMemberPoints service response
     */
    getBondMemberPointsHistory: function (params) {
        let getMemberPointsHistoryResponse;
        let token = bondHelper.getBondOauthToken();

        if (!empty(token) && !empty(params.loyaltyMemberId)) {

            getMemberPointsHistoryResponse = bondServices.getMemberPoints({
                token: token,
                loyaltyMemberId: params.loyaltyMemberId,
                requestBody: {
                    limit: 25,
                    skip: params.skip
                }
            });
        }
        return getMemberPointsHistoryResponse;
    },


    /**
     * FUNCTIONS BELOW FOR LOYALTY OFFER DATA ONLY - WILL NEED adjustments, temp placeholders of necessary functions.
     */

    /**
     * Clears the Profile attributes filteredOffers if customer is authenticated.
     * @function flushData
     * @memberof Loyalty
     * @param {dw.customer.Customer} customer - customer
     */
    flushData: function (customer) {
        if (!empty(customer) && customer.authenticated && !empty(customer.profile)) {
            customer.profile.custom.filteredOffers = '';
            return;
        }

        this.loyaltyLog().error('flushData(): Customer Loyalty error: Can not get Customer from session');
    },

    /**
     * Update sfcc customer profile attributes with Bond profile data
     * @function getOffers
     * @memberof Loyalty
     * @param {dw.customer.Profile} customerProfile - customer profile
     * @param {string} loyaltyID - loyaltyID from customer data
     * @param {string} SlasJWT - sfcc slas jwt
     * @param {Object} loyaltyStatusResult - response from Bond service
     * @return {Object} result - the filtered offer data on customer profile
     */
    getOffers: function (customerProfile, loyaltyID, SlasJWT, loyaltyStatusResult) {
        let result, offersResult;

        try {
            if (empty(SlasJWT)) {
                throw new Error('Loyalty Service JWT not available.');
            }

            let offersResponse = ServiceHelper.makeGetAllCouponHubServiceCall(customer, SlasJWT);

            if (!empty(offersResponse) && offersResponse.ok === true && !empty(offersResponse.object)) {
                offersResult = JSON.parse(offersResponse.object);
            } else if (JSON.parse(offersResponse.errorMessage).errorCode == 'END-MOD-OFFERS_NOT_FOUND') {//when offer data is not found
                offersResult = {};
                this.loyaltyLog().debug('Loyalty Service Response Error: END-MOD-OFFERS_NOT_FOUND');
            } else if (empty(offersResponse) || offersResponse.status == 'SERVICE_UNAVAILABLE' || offersResponse.errorMessage) {//no response or timeout
                throw new Error('Loyalty Service Response Error: ' + offersResponse.errorMessage);
            }

            if (!empty(offersResult) && !empty(loyaltyStatusResult) && (!empty(loyaltyStatusResult.loyaltyId) || !empty(loyaltyStatusResult.programPointsInfo))) {
                result = this.setFilteredData(customerProfile, offersResult, loyaltyStatusResult);
            }
        } catch (e) {
            this.loyaltyLog().error('Customer Offers (customerId : ' + customerProfile.customerNo + ' ) Error in loyaltyHelper.js: ' + e.message + " " + e.stack);
        }

        return result;
    },

    /**
     * Prepare Object based on Customer and Offers data structure
     * @function prepareFilteredData
     * @memberof Loyalty
     * @param {dw.customer.Profile} customerProfile - customer profile
     * @param {Object} offers - response from offer service call
     * @param {Object} loyaltyStatus - response from Bond service of if customer is active loyalty member
     * @return {Object} filteredData - the filtered offer data on customer profile
     */
    prepareFilteredData: function (customerProfile, offers, loyaltyStatus) {
        let filteredData, loyaltyId, pointsBalance, pointsToNextReward, pointsToNextThreshold, memberStatusPointsInfo;

        try {
            let rewardsEntries = this.getLoyaltyRewardsEntries(offers);
            let loyaltyOffersEntries = this.getLoyaltyOffersEntries(offers);
            let loyaltyBonusEntries = this.getLoyaltyBonusEntries(offers);

            //Parse the number of Items in each category per settings in BM
            let limitedRewardsEntries = this.getLimitedRewards(rewardsEntries.Entries, 'rewards', rewardsEntries.HasWelcomeReward);
            let limitedOffersEntries = this.getLimitedRewards(loyaltyOffersEntries, 'offers', null);
            let limitedBonusEntries = this.getLimitedRewards(loyaltyBonusEntries, 'bonus', null);

            if (!empty(loyaltyStatus)) {
                loyaltyId = loyaltyStatus.loyaltyId ? loyaltyStatus.loyaltyId : customerProfile.custom.bondLoyaltyId;
                pointsBalance = loyaltyStatus.pointsBalance ? loyaltyStatus.pointsBalance : 0;
                pointsToNextReward = loyaltyStatus.pointsToNextReward ? loyaltyStatus.pointsToNextReward : 0;
                pointsToNextThreshold = pointsBalance + pointsToNextReward;
                let anniversaryDate = loyaltyStatus.memberSince ? dataValidation.normalizeDateString(loyaltyStatus.memberSince) : '';

                memberStatusPointsInfo = {
                    status: loyaltyStatus.loyaltyStatus,
                    expiryDate: !empty(loyaltyStatus.pointsExpirationDate) ? Date.parse(dataValidation.normalizeDateString(loyaltyStatus.pointsExpirationDate)).toString() : '',
                    showDate: loyaltyStatus.showDate,
                    statusChangeDate: !empty(loyaltyStatus.statusChangeDate) ? Date.parse(dataValidation.normalizeDateString(loyaltyStatus.statusChangeDate)).toString() : '',
                    anniversaryDate: anniversaryDate
                };
            } else {
                loyaltyId = customerProfile.custom.loyaltyID ? customerProfile.custom.loyaltyID : '';
                pointsBalance = loyaltyStatus.programPointsInfo.currentPoints ? loyaltyStatus.programPointsInfo.currentPoints : 0;
                pointsToNextReward = this.calculateNextReward(loyaltyStatus);
                pointsToNextThreshold = loyaltyStatus.programPointsInfo.goalPoints ? loyaltyStatus.programPointsInfo.goalPoints : '';
                memberStatusPointsInfo = loyaltyStatus.memberStatusPointsInfo;
            }

            filteredData = {
                "LoyaltyDataSet": {
                    "AccountNumber": loyaltyId,
                    "PostalCode": customerProfile.custom.loyaltyPostalCode ? customerProfile.custom.loyaltyPostalCode : '',
                    "MemberStatusInfo": memberStatusPointsInfo,
                    "Rewards": {
                        "Threshold": pointsToNextThreshold,
                        "NextReward": pointsToNextReward,
                        "CurrentSpend": pointsBalance,
                        "Count": limitedRewardsEntries.Count,
                        "Entries": limitedRewardsEntries.Entries
                    },
                    "Offers": {
                        "Entries": limitedOffersEntries
                    },
                    "Bonus": {
                        "Count": limitedBonusEntries.Count,
                        "Entries": limitedBonusEntries.Entries
                    }
                }
            };

        } catch (e) {
            this.loyaltyLog().error('Customer Offers (customerId : ' + customerProfile.customerNo + ' ) Prepare Filtered Data Error: ' + e.message + ' Trace: ' + e.stack);
        }

        return filteredData;
    },
    /**
     * Calcalate Next Reward
     * @function calculateNextReward
     * @memberof Loyalty
     * @param {string} loyaltyStatus - response from bond if loyalty account is active
     * @return {Number} reward - the amount needed to get next reward
     */
    calculateNextReward: function (loyaltyStatus) {
        let reward = 0;
        if (
            !empty(loyaltyStatus)
            && !empty(loyaltyStatus.programPointsInfo)
            && !empty(loyaltyStatus.programPointsInfo.goalPoints)
            && !empty(loyaltyStatus.programPointsInfo.currentPoints)
        ) {
            let goalSpend = new Number(loyaltyStatus.programPointsInfo.goalPoints);
            let currentSpend = new Number(loyaltyStatus.programPointsInfo.currentPoints);
            if (currentSpend < 0) {
                currentSpend = 0;
            }

            reward = goalSpend - currentSpend;
            if (reward < 0) {
                reward = 0;
            }
        }

        return reward;
    },
    /**
     * Prepare Rewards (Specifically Offers)
     * @function getLoyaltyRewardsEntries
     * @memberof Loyalty
     * @param {Object} offers - offer data from loyalty service
     * @return {Object} entries - return formatted and sorted entries
     */
    getLoyaltyRewardsEntries: function (offers) {
        let result = {
            "Entries": [],
            "HasWelcomeReward": false,
            "Count": 0
        }
        if (empty(offers)) {
            return result;
        }
        //Get Rewards Array list
        let count = 0;
        let currentTime = new Date().getTime();
        for (let i = 0; i < Object.keys(offers).length; i++) {
            let offer = offers[i];
            let expDate = this.getExpirationDateInMilliseconds(offer);
            if (offer.store_redeemed == false && offer.online_redeemed == false && expDate >= currentTime) {
                if (offer.loyalty_related_offer == true && offer.description.toLowerCase().indexOf('welcome reward') === -1) {
                    result.Entries.push(offer);
                } else if (offer.description.toLowerCase().indexOf('welcome reward') !== -1) {
                    result.HasWelcomeReward = true;
                    count = 1;
                }
            }
        }

        result.Count = count + result.Entries.length;

        //Sort by Expiration Date
        result.Entries.sort(function (x, y) {
            return x.online_expiration_date - y.online_expiration_date;
        });

        result.Entries = this.prepareRewardsData(result.Entries);

        return result;
    },

    /**
     * Prepare Offers (Specifically Bonus Offers)
     * @function getLoyaltyBonusEntries
     * @memberof Loyalty
     * @param {Object} offers - offer data from loyalty service
     * @return {Object} entries - return formatted and sorted entries
     */
    getLoyaltyBonusEntries: function (offers) {
        let entries = {};

        let result = {
            "Entries": [],
            "HasWelcomeReward": false,
            "Count": 0
        }

        if (empty(offers)) {
            return entries;
        }

        if (Object.keys(offers).length > 0) {
            offers.sort(function (x, y) {
                return y.online_expiration_date != 0 ?
                    x.online_expiration_date - y.online_expiration_date :
                    y.online_expiration_date - x.online_expiration_date;
            });
        }

        let currentTime = new Date().getTime();

        for (let i = 0; i < Object.keys(offers).length; i++) {
            let offer = offers[i];
            let expDate = this.getExpirationDateInMilliseconds(offer);
            let isNotExpired = expDate === 0 ? true : expDate >= currentTime; //checks if there is a 0 for expiration or there is valid expiration (if 0 then does not expire)
            let isNearExpiration = expDate === 0 ? false : this.isNearingExpiration(offer); //unsure if needed but for now.
            if (offer.store_redeemed == false && offer.online_redeemed == false && offer.offerType === 'Bonus' && !this.isMaxIssueCount(offer) && isNotExpired) {
                //Collect only Offers
                if (offer.loyalty_related_offer == false) {
                    let chanel = this.getChanelName(offer);
                    let data = {
                        "Channel": chanel,
                        "ValidationMessage": this.getBonusValidationMessage(offer, expDate),
                        "NearingExpiration": isNearExpiration, //if  bonus has null for expiration date then there is no expiration.
                        "OfferType": offer.offerType,
                        "IsCappedOffer": offer.offerType == this._constants.offerTypes.capped,
                        "image_thumbnail": offer.image_thumbnail,
                        "description": offer.description, //offer.title
                        "Title": this.prepareBonusTitleObject(offer.details[0]), //offer.description
                        "offerID": offer.offerId, //for activate CTA button
                        "optInRequired": offer.optInRequired, // used to determine if optin is needed to be "activated" - optinrequired false + optin false = display activated
                        "optIn": offer.optedIn, // use for activate CTA or remain as activated
                        "shopCta": offer.shop_cta, // used for loading the shop now button -> href send user to pdp,
                        "expDate": expDate // add expiration date in milli seconds to data
                    };

                    //all offers sorted by date, used on the cart page
                    if (entries.hasOwnProperty('Sorted')) {
                        entries['Sorted'].push(data);
                    } else {
                        entries['Sorted'] = new Array(data);
                    }
                }
            }
        }

        return entries;
    },
    /**
     * Gets offers but checking type of offer and expirations - in store vs online only
     * @function getLoyaltyOffersEntries
     * @memberof Loyalty
     * @param {Object} offers - offer data from loyalty service
     * @return {Object} entries - return formatted and sorted entries
     */
    getLoyaltyOffersEntries: function (offers) {
        let entries = {};

        if (empty(offers)) {
            return entries;
        }

        //Sort by Expiration Date
        if (Object.keys(offers).length > 0) {
            offers.sort(function (x, y) {
                return x.online_expiration_date - y.online_expiration_date;
            });
        }
        let currentTime = new Date().getTime();

        for (let i = 0; i < Object.keys(offers).length; i++) {
            let offer = offers[i];
            let expDate = this.getExpirationDateInMilliseconds(offer);
            if (offer.store_redeemed == false && offer.online_redeemed == false && expDate >= currentTime && offer.offerType !== 'Bonus') {
                //Collect only Offers
                if (offer.loyalty_related_offer == false || offer.description.toLowerCase().indexOf('welcome reward') !== -1) {
                    let chanel = this.getChanelName(offer);
                    let redeemCode =this.getRedeemCode(offer);
                    let data = {
                        "Chanel": chanel,
                        "OnlineCode": redeemCode.onlineCode,
                        "InStoreCode": redeemCode.inStoreCode,
                        "ValidationMessage": this.getValidationMessage(offer),
                        "NearingExpiration": this.isNearingExpiration(offer),
                        "OfferType": offer.offerType,
                        "IsCappedOffer": offer.offerType == this._constants.offerTypes.capped,
                        "welcome": offer.description.toLowerCase().indexOf('welcome reward') !== -1,
                        "image_thumbnail": offer.image_thumbnail,
                        "description": offer.description,
                        "Title": this.prepareTitleObject(offer)
                    };
                    if (entries.hasOwnProperty(chanel)) {
                        entries[chanel].push(data);
                    } else {
                        entries[chanel] = new Array(data);
                    }

                    //all offers sorted by date, used on the cart page
                    if (entries.hasOwnProperty('Sorted')) {
                        entries['Sorted'].push(data);
                    } else {
                        entries['Sorted'] = new Array(data);
                    }
                }
            }
        }

        return entries;
    },
    /**
     * Prepare Offers (Specifically Rewards Data)
     * @function prepareRewardsData
     * @memberof Loyalty
     * @param {Object} collection - the list of rewards
     * @return {Object} result - the list of rewards reformatted and sorted
     */
    prepareRewardsData: function (collection) {
        let val, index, values = [], result = {};
        let groupProperty = 'description';
        for (let i = 0; i < collection.length; i++) {
            val = collection[i][groupProperty];
            index = values.indexOf(val);
            let data = {
                "Chanel": this.getChanelName(collection[i]),
                "OnlineCode": collection[i].online_offer_code ? collection[i].online_offer_code : '',
                "InStoreCode": collection[i].bar_code ? collection[i].bar_code : '',
                "ValidationMessage": this.getValidationMessage(collection[i]),
                "NearingExpiration": this.isNearingExpiration(collection[i]),
                "image_thumbnail": collection[i].image_thumbnail,
                "Title": this.prepareTitleObject(collection[i])
            };
            //Group by field name
            if (index > -1) {
                result[val].push(data);
            } else {
                values.push(val);
                result[val] = new Array(data);
            }
        }

        return result;
    },

    /**
     * Get Validation message
     * @function getValidationMessage
     * @memberof Loyalty
     * @param {Object} item - single offer param
     * @return {String} validationMessage - sends back the validation message until date
     */
    getValidationMessage: function (item) {
        let validationMessage = "Valid through ";
        if (empty(item)) {
            return validationMessage;
        }

        let expirationMilliseconds = this.getExpirationDateInMilliseconds(item);
        let date = new Date(expirationMilliseconds);
        let calendarDate = new Calendar(date);
        calendarDate.setTimeZone(System.getInstanceTimeZone());
        let validationDate = dw.util.StringUtils.formatCalendar(calendarDate, dataValidation.validationMessageDatePattern());

        return validationMessage + validationDate;
        //return Resource.msgf('global.rewards.validationmessage', 'locale', null, validationDate);
    },

    /**
     * Get Validation message (Bonus)
     * @function getBonusValidationMessage
     * @memberof Loyalty
     * @param {Object} item - single offer param
     * @param {string} expDate - expiration date from offer
     * @return {String} validationMessage - sends back the validation message until date
     */
    getBonusValidationMessage: function (item, expDate) {
        let validationMessage = '';

        if (empty(item) || expDate === 0) {
            return validationMessage;
        }

        let expirationMilliseconds = this.getExpirationDateInMilliseconds(item);
        let date = new Date(expirationMilliseconds);
        let calendarDate = new Calendar(date);
        calendarDate.setTimeZone(System.getInstanceTimeZone());
        let validationDate = dw.util.StringUtils.formatCalendar(calendarDate, dataValidation.validationMessageDatePattern());

        return "Valid through " + validationDate;
    },
    /**
     * Get time if near expiration true false based on todays time and date.
     * if its near expiration based on specific expiration range
     * @function isNearingExpiration
     * @memberof Loyalty
     * @param {Object} item - single offer param
     * @return {Boolean} - return true or false
     */
    isNearingExpiration: function (item) {
        let nearingExpiration = false;
        if (empty(item)) {
            return nearingExpiration;
        }

        let currentTime = new Date().getTime();
        let expirationMilliseconds = this.getExpirationDateInMilliseconds(item);
        let result = new Number(expirationMilliseconds - currentTime).toFixed(0);
        let countDays = new Number(dataValidation.millisecondsToDays(result)).toFixed(0);
        if (countDays <= this.daysExpirationWarning()) {
            nearingExpiration = true;
        }

        return nearingExpiration;
    },
    /**
     * Gets max issuance count of an offer
     * @function isMaxIssueCount
     * @memberof Loyalty
     * @param {Object} item - single offer param
     * @return {Boolean} - return true or false
     */
    isMaxIssueCount: function (item) {
        let isMaxed = false;
        if (empty(item)) {
            return isMaxed;
        }

        let maximumIssueCount = item.maximumIssueCount;
        let issueCount = item.issueCount;

        if (!empty(maximumIssueCount) && !empty(issueCount) && issueCount >= maximumIssueCount) {
            isMaxed = true;
        }

        return isMaxed;
    },
    /**
     * Gets true false if offer is expired or not.
     * @function isExpired
     * @memberof Loyalty
     * @param {Object} item - single offer param
     * @return {Boolean} - return true or false
     */
    isExpired: function (item) {
        let currentTime = new Date().getTime();
        let expirationMilliseconds = this.getExpirationDateInMilliseconds(item);
        return expirationMilliseconds < currentTime ? true : false;
    },
    /**
     * Gets expriation date converted into miliseconds and return miliseconds to expiration
     * @function getExpirationDateInMilliseconds
     * @memberof Loyalty
     * @param {Object} item - single offer param
     * @return {Number} miliseconds - return the number of miliseconds to expiration date
     */
    getExpirationDateInMilliseconds: function (item) {
        let milliseconds = 0;
        if (empty(item)) {
            return milliseconds;
        }

        if (item.active_in_omni_channel == true || item.active_in_direct == true) {
            //Get Max date
            milliseconds = Math.max(item.online_expiration_date, item.store_expiration_date);
        } else if (item.active_in_stores == true) {
            //store_expiration_date
            milliseconds = item.store_expiration_date;
        }

        if (item.expDate) {
            return item.expDate;
        }

        //Time set in the seconds. Need milliseconds
        return milliseconds * 1000;
    },
    /**
     * Parse number of Items in each category to equal display amount
     * Get limited count Offers or Rewards according to display amount
     * According to type return object has the different structure
     * @function getLimitedRewards
     * @memberof Loyalty
     * @param {Object} object - the collection of offers based on category
     * @param {type} type - the type of collection of offers (ie offer, bonus, reward)
     * @param {hasWelcomeReward} hasWelcomeReward
     */
    getLimitedRewards: function (object, type, hasWelcomeReward) {
        let countedEntries;
        if (type == 'rewards') {
            countedEntries = {
                "Count": 0,
                "Entries": {}
            }
        } else if (type == 'bonus') {
            countedEntries = {
                "Count": 0,
                "Entries": {}
            };
        } else if (type == 'offers') {
            countedEntries = {};
        }

        if (empty(object)) {
            return countedEntries;
        }

        for (let key in object) {
            let entrie = object[key];
            let entrieLength = entrie.length;
            if (key != 'Sorted' && entrieLength > this.getMaxNumberOfOffers()) {
                entrie = entrie.slice(0, this.getMaxNumberOfOffers());
            }

            if (type == 'bonus') {
                countedEntries.Count += entrie.length;
                countedEntries.Entries[key] = entrie;
            } else if (type == 'offers') {
                countedEntries[key] = entrie;
            } else if (type == 'rewards') {
                countedEntries.Count += entrie.length;
                countedEntries.Entries[key] = entrie;
            }
        }

        if (hasWelcomeReward) {
            countedEntries.Count += 1;
        }

        return countedEntries;
    },
    /**
     * Get chanel name according to active state - Mostly used for differentiating offers
     * @function getChanelName
     * @memberof Loyalty
     * @param {Object} item - single offer param
     * @return {string} - return specific type of offer type redemption type
     */
    getChanelName: function (item) {
        let chanel = '';
        if (empty(item)) {
            return chanel;
        }
        if (item.active_in_direct == true && item.active_in_stores == false && item.active_in_omni_channel == false) {
            chanel = 'Online Only';
        } else if (item.active_in_stores == true && item.active_in_direct == false && item.active_in_omni_channel == false) {
            chanel = 'In Stores Only';
        } else if (item.active_in_stores == true && item.active_in_omni_channel == true) {
            chanel = 'In Stores & Online';
        }

        return chanel;
    },

    /**
     * Get Offer online as well as store redeem codes.
     * @function getRedeemCode
     * @memberof Loyalty
     * @param {Object} item - single offer param
     * @return {Object} - return specific redeeem code type for offer
     */
    getRedeemCode: function (item) {

        let redeemCode = {
        		"onlineCode" : "",
        		"inStoreCode" : ""
        };

        if (item.active_in_direct || item.active_in_omni_channel) {
        	redeemCode.onlineCode = item.online_offer_code ? item.online_offer_code : '';
        }

        if (item.active_in_stores || item.active_in_omni_channel) {
        	redeemCode.inStoreCode = item.bar_code ? item.bar_code : '';
        }

        return redeemCode;
    },

    /**
     * Set title object when displaying on offers page front end ui
     * @function prepareTitleObject
     * @memberof Loyalty
     * @param {Object} item - single offer param
     * @return {Object} return - the title object
     */
    prepareTitleObject: function (item) {
        let titleObject = {
            "title": '',
            "details": []
        };
        if (empty(item)) {
            return titleObject;
        }

        titleObject.title = item.title;
        titleObject.details = item.details;

        return titleObject;
    },
    /**
     * Set title object for bonus when displaying on offers page front end ui
     * @function prepareBonusTitleObject
     * @memberof Loyalty
     * @param {Object} item - single offer param
     * @return {Object} return - the title object
     */
    prepareBonusTitleObject: function (item) {
        let titleObject = {
            "title": '',
            "bullets": []
        };
        if (empty(item)) {
            return titleObject;
        }

        titleObject.title = item.title;
        titleObject.bullets = item.bullets;

        return titleObject;
    },
    /**
     * Get reward expiration date for offer based on epoch date
     * @function getRewardExpiration
     * @memberof Loyalty
     * @param {Date} epochDate - single offer param
     * @return {Object} return - the title object
     */
    getRewardExpiration: function (epochDate) {
        try {
            let passedDate = new Date(Number(epochDate));
            let calendarDate = new Calendar(passedDate);
            calendarDate.setTimeZone('EST');

            return dw.util.StringUtils.formatCalendar(calendarDate, "MM/dd/yy");
        } catch (e) {
            this.loyaltyLog().error(e.message);
        }
    },

    /**
     * check if customer belongs to respective customers group and return the status
     * code for Loyalty member status
     * @function checkLoyaltyCustomerGroup
     * @memberof Loyalty
     * @param {Customer} Customer - customer param
     * @return {String} loyaltyMemberStatus - retruns active loyalty or not
     */
    checkLoyaltyCustomerGroup: function (Customer) {
        let value = '';
        try {
            let loyaltyMemberStatus;

            if (!empty(Customer) && !empty(Customer.profile)) {
                loyaltyMemberStatus = Customer.profile.custom.bondLoyaltyStatus;

                // Customer passed as parameter
                if (!empty(loyaltyMemberStatus) && (!empty(Customer.profile.custom.bondLoyaltyId) || !empty(Customer.profile.custom.loyaltyID)) &&
                    Customer.isMemberOfAnyCustomerGroup('LoyaltyCustomers')) {
                    value = loyaltyMemberStatus.toLowerCase();
                }
            }
        } catch (e) {
            this.loyaltyLog().error(e.message);
        }

        return value;
    },

    /**
     * Handles the Opt in flag for offers after activate is triggered to pass data to reduce calls to bond - to sync data
     * @function setBonusOptInTrue
     * @memberof Loyalty
     * @param {Object} paramData - paramdata that contains data to update the customer object
     * @param {dw.customer.Profile} customerProfile - customer profile from api call - if customer is not current logged in, query for customer
     */
    setBonusOptInTrue: function (paramData, customerProfile) { //gets customer object
        try {
            if (!empty(customerProfile)) {
                let currentCustomer = customerProfile.getCustomer();
                let curFilteredData = customerProfile.custom.filteredOffers;
                let updatedFilterData = JSON.parse(curFilteredData);
                let checkLoyalty = !empty(currentCustomer) ? this.checkLoyaltyCustomerGroup(currentCustomer) : '';

                if (!empty(currentCustomer) && !empty(customerProfile) && !empty(checkLoyalty) && customerProfile.custom.loyaltyID === updatedFilterData.LoyaltyDataSet.AccountNumber && updatedFilterData.LoyaltyDataSet.AccountNumber === paramData.loyaltyMemberId && !empty(paramData.offerId)) {
                    // Update profile in SFCC
                    let bonusEntries = updatedFilterData && updatedFilterData.LoyaltyDataSet &&
                        updatedFilterData.LoyaltyDataSet.Bonus && updatedFilterData.LoyaltyDataSet.Bonus.Count > 0 &&
                        updatedFilterData.LoyaltyDataSet.Bonus.Entries && updatedFilterData.LoyaltyDataSet.Bonus.Entries.Sorted &&
                        updatedFilterData.LoyaltyDataSet.Bonus.Entries.Sorted.length ? updatedFilterData.LoyaltyDataSet.Bonus.Entries.Sorted : [];; //get bonus entries (formatted data from last api call, used everywhere)

                    if (!empty(bonusEntries)) {
                        for (let i = 0; i < bonusEntries.length; i++) {
                            if (!empty(bonusEntries[i]) && !empty(bonusEntries[i].offerID) && bonusEntries[i].offerID === paramData.offerId && bonusEntries[i].optIn === false) {
                                updatedFilterData.LoyaltyDataSet.Bonus.Entries.Sorted[i].optIn = true;
                            }
                        }
                        customerProfile.custom.filteredOffers = JSON.stringify(updatedFilterData);
                    }
                } else {
                    throw new Error('CustomerID: ' + currentCustomer.customerNo + ', OfferID: ' + paramData.offerId + ' Error in Common.js: ');
                }
            } else {
                throw new Error('Customer Data not found, Error in Common.js: ');
            }
        } catch (e) {
            this.loyaltyLog().error('Could not set Bonus Opt In : ' + e.message + ' Error in Common.js: ' + e.stack);
        }
    },

    /**
     * Search profile by email hash
     * @function searchProfileByEmailHash
     * @memberof Loyalty
     * @param {string} emailHash - emailHash to query sfcc by
     */
    searchProfileByEmailHash: function (emailHash) {
        try {
            let customer = CustomerMgr.searchProfile('custom.emailHash = {0}', emailHash);
            return customer;
        } catch (e) {
            this._getLoyaltyLog().error('Search emailHash failed. Error: ' + e.message + ' Trace: ' + e.stack);
            return;
        }
    },

    /** check if offer ID provided is present in customer profile's filteredOffers and return offerInfo
     * @function getOfferInfoFromProfile
     * @memberof loyaltyHelper
     * @param {dw.customer.Profile} profile - profile from customer to do a check if offer exists on profile
     * @param {Object} offerId - offer id that was used
     */
    getOfferInfoFromProfile(profile, offerId) {
        const response = {
            offerInfo: null,
            isExpired: false
        }
        const offerData = !empty(profile) && !empty(profile.custom.filteredOffers) ? JSON.parse(profile.custom.filteredOffers) : [];
        if (!empty(offerData)) {
            const bonusEntries = offerData && offerData.LoyaltyDataSet &&
                offerData.LoyaltyDataSet.Bonus && offerData.LoyaltyDataSet.Bonus.Count > 0 &&
                offerData.LoyaltyDataSet.Bonus.Entries && offerData.LoyaltyDataSet.Bonus.Entries.Sorted &&
                offerData.LoyaltyDataSet.Bonus.Entries.Sorted.length ? offerData.LoyaltyDataSet.Bonus.Entries.Sorted : [];
            if (!empty(bonusEntries) && offerId) {
                // will be true if offerId passed in params is present in offer data bonusEntries
                bonusEntries.forEach(function (offer) {
                    if (offer.offerID === offerId) { //set offer info
                        response.offerInfo = offer;
                        response.isExpired = loyaltyHelper.isExpired(offer);
                    }
                });
            }
        }
        return response;
    }
}

exports.loyaltyHelper = loyaltyHelper;
