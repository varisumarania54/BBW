

/**
 * Extract the geolocation data of the customer with the IP address from shopper context
 * @function extractGeolocationHeaders
 * @param {geolocationHeaders} geolocationHeaders - geolocation header from shoppercontext
 * @returns {string} Returns geolocation value
 */
function extractGeolocationHeaders(geolocationHeaders) {
    const result = new Array(8).fill(null);

    // Loop through the geolocation headers and map the values to the correct positions
    geolocationHeaders.forEach(header => {
        const [key, value] = header.split(': ').map(str => str.trim());
        
        // Assign values to the result array based on the key
        switch (key) {
            case 'CountryCode':
                result[0] = value;
                break;
            case 'Country':
                result[1] = value;
                break;
            case 'City':
                result[2] = value;
                break;
            case 'PostalCode':
                result[3] = value;
                break;
            case 'MetroCode':
                result[4] = value;
                break;
            case 'Region':
                result[5] = value;
                break;
            case 'RegionCode':
                result[6] = value;
                break;
            case 'Latitude':
                result[7] = value;
                break;
            case 'Longitude':
                result[8] = value;
                break;
        }
    });

    return result;
}

 
module.exports = {
    extractGeolocationHeaders,
}