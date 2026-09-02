const internationalLocationHelper = require('app_composable/cartridge/scripts/helpers/internationalRedirect/internationalLocationHelper');
const locationCustomObject = internationalLocationHelper.getActiveLocationList();
const Site = require('dw/system/Site').getCurrent();

/**
 * A sorting algorithm to alphabetically sort country names
 * @function sortByCountry
 * @param {*} a 
 * @param {*} b 
 * @return 1 or -1 based on which country is ahead alphabetically
 * 
 */

const sortByCountry = function (a, b) {
    let nameA = a.text.toUpperCase();
    let nameB = b.text.toUpperCase();
    // sort in an ascending order
    if (nameA < nameB) {
        return -1;
    }
    if (nameA > nameB) {
        return 1;
    }
    // names must be equal
    return 0;
};
/**
 * Sorts the list of available countries for the international redirect modal and returns data for the front end to use to build it
 * @function getInternationalRedirect
 * @returns Data to build the international redirect modal
 */
exports.getInternationalRedirect = function () {

    let optionList = [];
    locationCustomObject.forEach((location) => {
        optionList.push({ value: location.URL, text: location.Country, countryCode: location.CountryCode });
    })


    optionList.sort(sortByCountry);

    return {
        fieldId: "international-redirect-select",
        textLabel: "Select",
        titleTextLabel: Site.getCustomPreferenceValue('InternationalRedirectSelectLabel'),
        optionalIndicator: "",
        ctaText: Site.getCustomPreferenceValue('InternationalRedirectCTAText'),
        stayText: Site.getCustomPreferenceValue('InternationalRedirectStayText'),
        helperText: {
            textStart: Site.getCustomPreferenceValue('InternationalRedirectHelperStartText'),
            textEnd: Site.getCustomPreferenceValue('InternationalRedirectHelperEndText'),
            textLink: Site.getCustomPreferenceValue('InternationalRedirectHelperLinkText'),
            linkURL: Site.getCustomPreferenceValue('InternationalRedirectHelperLinkURL')
        },
        availableBody: Site.getCustomPreferenceValue('InternationalRedirectAvailableBody'),
        unavailableHeader: Site.getCustomPreferenceValue('InternationalRedirectUnavailableHeader'),
        errorMessageText: Site.getCustomPreferenceValue('InternationalRedirectErrorMessage'),
        optionsList: optionList,
        isRequiredError: "true"
    }

}