/**
 * Transforms xml to json at a high level
 * @namespace xmlToJson
 */

/**
 * isElementArray: Detects if element has an array of same type of children nodes
 * @function isElementArray
 * @memberof xmlToJson
 * @param {XML} element - Parent element
 * @param {XML} children - children elements
 * @returns {Boolean} Returns null if input is not a string or formatted string
 */
function isElementArray(element, children) {
    const childrenCount = children.length();
    if (childrenCount > 1) {
        const firstChildName = children[0].name();
        const matchingChildrenCount = element.elements(firstChildName).length();
        if (matchingChildrenCount > 1 && childrenCount === matchingChildrenCount) {
            return true;
        }
    }
    return false;
}

/**
 * parseAttributes: Builds an object of all node/element attributes
 * @function parseAttributes
 * @memberof xmlToJson
 * @param {XML} element - Target element
 * @returns {Object} Returns object of attributes
 */
function parseAttributes(element, options) {
    let attrObj = new Object();
    const attributes = element.attributes();
    for (let i in attributes) {
        let attribute = attributes[i];
        let name = attribute.localName();
        let text = attribute.text();
        if (name && text && text[0]) {
            attrObj[name] = parseValue(text[0], name, options);
        }
    }
    return attrObj;
}

/**
 * parseComplexContent: Build json by recursively parsing nested elements
 * @function parseComplexContent
 * @memberof xmlToJson
 * @param {XML} element - Iteration element
 * @param {Object} json - Object that persists attribute data 
 * @returns {Object} Returns object of parsed XML data
 */
function parseComplexContent(element, json, options) {
    let children = element.children();
    let isArrayOfElements = isElementArray(element, children);
    let parseOptions = options && options.parse;
    let name = element.localName();
    let parseOption = parseOptions.find(option => option.property === name);
    if (parseOption && parseOption.valueType === 'Array' && !isArrayOfElements && children.length() === 1) {
        return [parse(children[0], options)];
    }
    if (isArrayOfElements) {
        if (Object.keys(json).length) {
            json['childNodes'] = new Array();
        } else {
            json = new Array();
        }
    }

    // Iterate through children and recursively process elements
    for (let i in children) {
        let child = children[i];
        let property = child.localName();
        if (property) {
            // Recursively handle child elements
            let data = parse(child, options);
            // Merge into existing data
            if (json.hasOwnProperty(property)) {
                // If property exists merge existing and new data into array
                json[property] = new Array(json[property], data);
            } else if (isArrayOfElements) {
                // If child element is a part of array push data
                if (json.hasOwnProperty('childNodes')) {
                    let obj = new Object();
                    obj[property] = data;
                    json['childNodes'].push(obj);
                } else {
                    json.push(data);
                }
            } else {
                json[property] = data;
            }
        }
    }
    return json;
}
/**
 * parseSimpleContent: Builds string or object response for simple XML objects
 * @function parseSimpleContent
 * @memberof xmlToJson
 * @param {XML} element - Target element
 * @param {Object} json - Object used to persist attribute data 
 * @returns {String|Object} Returns String or Object to perserve attributes
 */
function parseSimpleContent(element, json, options) {
    const name = element.localName();
    const innerText = element.text();
    const value = parseValue(innerText, name, options);
    // If attributes json exists assign inner node text as "value"
    if (typeof json === 'object' && Object.keys(json).length) {
        if (!empty(value)) {
            Object.assign(json, { value });
        }
        return json;
    }
    return !empty(value) ? value : null;
}
/**
 * parseValue: Converts XML node inner text into Boolean, String, or Number
 * @function parseValue
 * @memberof xmlToJson
 * @param {XML|XMLList} xmlText - Value to convert
 * @returns {Boolean|String|Number} Returns converted value
 */
function parseValue(xmlText, name, options) {
    let value;
    let valueType;
    const parseOptions = options && options.parse;
    if (parseOptions) {
        let parseOption = parseOptions.find(option => option.property === name);
        valueType = parseOption && parseOption.valueType;
    }
    switch (valueType) {
        case 'String':
            value = xmlText.toString().trim();
            break;
        default:
            value = xmlText.toString().trim();
            if (value === 'true') {
                value = true;
            }
            if (value === 'false') {
                value = false;
            }
            if (!isNaN(value) && value !== '') {
                value = Number(value);
            }
            break;
    }
    return value;
}
/**
 * Places json response in root object 
 * @function assignToRootObject
 * @memberof xmlToJson
 * @param {XML} document - XML document
 * @param {Object} json - xml converted to json
 * @returns {Object} Returns object with nested json response
 */
function assignToRootObject(document, json) {
    let rootObject = new Object();
    if (!document.parent()) {
        const propertyName = document.localName();
        rootObject[propertyName] = json;
    }
    return rootObject;
}
/**
 * Returns the value of a custom attribute array 
 * @function getCustomAttributeValue
 * @memberof xmlToJson
 * @param {Array} customAttributes - Array of objects containing keys and values
 * @param {String} key - Key to search for in customAttributes
 * @returns {String|null} Returns string value or null if match not found
 */
function getCustomAttributeValue(customAttributes, key) {
    const customAttribute = customAttributes.find(attr => 'Key' in attr && attr.Key === key);
    return customAttribute && 'Value' in customAttribute && customAttribute.Value || null;
}

/**
 * xmlToJson: Builds json object from XML element
 * @function xmlToJson
 * @memberof xmlToJson
 * @param {XML} element - XML node
 * @returns {Object} Returns JSON object representation of input node
 */
function parse(element, options) {
    let json = new Object();
    // Parse attributes and merge them into the response
    const attributes = parseAttributes(element, options);
    Object.assign(json, attributes);
    // Handle simple content <Example>String value</Example>
    if (element && element.hasSimpleContent()) {
        json = parseSimpleContent(element, json, options);
    }
    // Handle complex or nested content <Example><Value>true</Value></Example>
    if (element && element.hasComplexContent()) {
        json = parseComplexContent(element, json, options);
    }
    return json;
}

/**
 * process: Converts XML Document into JSON Object
 * Conversion quirk: Elements with child nodes -> Array | Elements with 1 child node -> Object 
 * @function process
 * @memberof xmlToJson
 * @param {XML} document - object of xml elements
 * @param {Object} options - processing options for desired output
 * @returns {Object} Returns JSON Object
 */
function parseDocument(document, options) {
    try {
        if (typeof document === 'xml' && document.elements().length()) {
            return parse(document, options);
            // return assignToRootObject(document, json);
        } else {
            return null;
        }
    } catch (error) {
        throw new Error(`Error in xmlToJson: ${error.message}`);
    }
}

module.exports = {
    parseDocument
}