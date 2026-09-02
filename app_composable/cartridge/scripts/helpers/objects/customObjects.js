/**
 * Util helpers for custom objects
 * @namespace customObjects
 */
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;
const CustomObjectMgr = require('dw/object/CustomObjectMgr');
const Transaction = require('dw/system/Transaction');
const Site = require('dw/system/Site').getCurrent();
const convertAttributeToJSON = require('app_composable/cartridge/scripts/helpers/objects/attributes.js').convertAttributeToJSON
/**
 * Creates new unique custom object and returns if it was successful or not
 * @function createUniqueCustomObject
 * @memberof customObjects
 * @param {String} type - custom object type
 * @param {String} key - unique custom object key
 * @param {Object} customAttributes - custom attributes to add to custom object
 * @return {Boolean} - unqiue custom object created successfully
 */
function createUniqueCustomObject(type, key, customAttributes) {
    let success = false;
    try {
        const customObject = CustomObjectMgr.getCustomObject(type, key);
        if (customObject) {
            success = true;
        } else {
            Transaction.wrap(() => {
                let newCustomObj = CustomObjectMgr.createCustomObject(type, key);
                Object.keys(customAttributes).forEach(attribute => {
                    newCustomObj.custom[attribute] = customAttributes[attribute];
                });
                success = true;
            });
        }
    } catch (error) {
        logHandler.logger.error(error, 'Scripts', 'customObjects');
    }
    return success;
}

function isCustomObjectPublic(type) {
    if(Site.getCustomPreferenceValue('publicCustomObjectsTypes')) {
       return Site.getCustomPreferenceValue('publicCustomObjectsTypes').includes(type);
    }
    return false;
}

function getCustomAttributesList(customObjects) {
    var customObjectList = new Array();
    while (customObjects.hasNext()) {
        let customObject = customObjects.next();
        let customAttributes = {};
        for (let key in customObject.custom) {
            let customAttribute = customObject.custom[key];
            if (customAttribute instanceof dw.value.EnumValue) {
                customAttributes[key] = {
                    displayName: customAttribute.getDisplayValue(),
                    value: customAttribute.getValue()
                };
            } else {
                customAttributes[key] = convertAttributeToJSON(customAttribute);
            }
        };
        customObjectList.push(customAttributes);
    }
    return customObjectList;

}

function getCustomObjectByType(type, countryName) {
    let customObjects;
    switch (type) {
        case "InternationalLocation":
            let queryStr = "custom.Active = true";
            let sortStr = "custom.Country asc";
            customObjects = CustomObjectMgr.queryCustomObjects(type, queryStr, sortStr);
            break;
        case "InternationalStores":
            customObjects = CustomObjectMgr.queryCustomObjects(type, "custom.country = '" + countryName + "'", "custom.country asc")
            break;
        default:
            /**  A new individual switch case must be created for each custom object type whitelisted
                There should be no default behavior that returns all custom objects of any type
                DO NOT MAKE THIS SHORTCUT OF LETTING DEFAULT CASE RETURN EVERY CUSTOM
                OBJECT JUST BECAUSE IT IS WHITELISTED BY THE SITE PREFERENCE "publicCustomObjectsTypes" 
            */

            /** CustomObjectMgr.getAllCustomObjects(type); is dangerous to use because it returns every custom object
                of that type. This could cause a serious issue/failure in production if misused
            */
            break;
    }
    return customObjects;
}

function getCustomObjects(type) {

    if (isCustomObjectPublic(type)) {
        switch (type) {
            case "InternationalStores":
                let countries = getCustomObjectByType("InternationalLocation");
                let countryObjects = getCustomAttributesList(countries);
                countryObjects.forEach(country => {
                    let stores = getCustomObjectByType("InternationalStores", country.Country);
                    country.stores = getCustomAttributesList(stores);
                    if (country.stores.every(obj => 'location' in obj && 'storeName' in obj)) {
                        country.stores.sort((a,b) => { 
                            var locationCompare = a.location.localeCompare(b.location);
                            switch (locationCompare) {
                                case 1:
                                    return 1;
                                case 0:
                                    return a.storeName.localeCompare(b.storeName);
                                case -1:
                                    return -1;
                                default:
                                    return 0;
                            }                        
                        })
                    }
                });
                return countryObjects.filter((country) => !empty(country.stores));
            default:
                /** A new individual switch case must be created for each custom object type whitelisted
                    There should be no default behavior that returns all custom objects of any type
                    DO NOT MAKE THIS SHORTCUT OF LETTING DEFAULT CASE RETURN EVERY CUSTOM
                    OBJECT JUST BECAUSE IT IS WHITELISTED BY THE SITE PREFERENCE "publicCustomObjectsTypes" 
                */
                const errorHandler = require('app_composable/cartridge/scripts/helpers/util/errorHandler.js').errorHandler;
                throw new errorHandler.error('CUSTOM-OBJECT-02-001', type);
                
            }
    }

    throw Error(`Custom Objects Type '${type}' is private`);
}

module.exports = { getCustomObjects, createUniqueCustomObject }