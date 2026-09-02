'use strict';

/**
 *
 *
 * @param {String} str - string which required case changes
 * @param {string} type - string having values upperCase | titleCase | lowerCase
 * @returns
 */
function changeStrCase(str, type) {
    if (!str) return '';
    switch (type) {
        case 'upperCase':
            return str.toUpperCase();
        case 'titleCase':
            return str.replace(
                /\w\S*/g,
                function (txt) {
                    return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
                }
            );
        default:
            return str.toLowerCase();
    }
}

function obscureString(key, start, middle, end) {
    let visibleStrLen = start + end;
    if (key.length <= (visibleStrLen)) {
        return '*'.repeat(key.length);
    }
    let strStart = key.slice(0, start);
    let strMiddle = middle > 0 ? middle : key.length - visibleStrLen;
    let strEnd = key.slice((-1 * end));
    let obscured = '*'.repeat(strMiddle);
    return `${strStart}${obscured}${strEnd}`;
}

module.exports = {
    changeStrCase,
    obscureString
}