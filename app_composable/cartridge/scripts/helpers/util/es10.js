/**
 * Util helpers for es10 methods that are not currently supported
 * @namespace es10
 */

/**
 * Flattern nested arrays for ease of parsing such as array.find()
 * Array.flat() introduced in es10 is not yet available 
 * References should be updated when es10 is supported
 * @function flattenArray
 * @memberof es10
 * @param {Array} array - nested arrays
 * @param {Number} depth - how many levels of nested arrays to flatten
 * @return {Array} - flat array
 */
function flattenArray(array, depth) {
    let depthLvl = depth || 1;
    return array.reduce((acc, val) =>
        Array.isArray(val) && depthLvl > 1
            ? acc.concat(flattenArray(val, depthLvl - 1))
            : acc.concat(val),
    []);
}

module.exports = { flattenArray };
