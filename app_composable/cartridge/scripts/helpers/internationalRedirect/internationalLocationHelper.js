const CustomObjectMgr = require("dw/object/CustomObjectMgr");

const internationalLocationHelper = {
    getActiveLocationList: function () {
        let locations = [];
        let InternationalLocationIterator = CustomObjectMgr.queryCustomObjects(
            "InternationalLocation",
            "custom.Active=true",
            null
        );
        while (InternationalLocationIterator.hasNext()) {
            let location = InternationalLocationIterator.next();
            if (location.custom.Active) {
                locations.push({
                    URL: location.custom.URL,
                    Country: location.custom.Country,
                    CountryCode: location.custom.CountryCode.value,
                    Active: location.custom.Active,
                });
            }
        }
        return locations;
    },
};

module.exports = internationalLocationHelper;