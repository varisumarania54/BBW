'use strict';

const LocalServiceRegistry = require('dw/svc/LocalServiceRegistry');
const StringUtils = require('dw/util/StringUtils');
const Site = require('dw/system/Site').getCurrent();

module.exports = {
    getTokenForIframe: LocalServiceRegistry.createService('radial.app.token', {
            createRequest: function(svc, req) {
                const radialTokenServiceClientID = Site.getCustomPreferenceValue('radialTokenServiceClientID');
                const radialTokenServiceScope = Site.getCustomPreferenceValue('radialTokenServiceScope');
                let requestBody;

                svc.setRequestMethod('POST');
                svc.addHeader('Content-Type', 'application/x-www-form-urlencoded');
                const credentials = svc.getConfiguration().getCredential();

                // The client ID and client secret joined by a colon ( ':' ) and encoded using the base-64 encoding scheme.
                let token = StringUtils.encodeBase64(credentials.user + ':' + credentials.password);
                svc.addHeader('Authorization', 'Basic ' + token);
                requestBody = 'grant_type=client_credentials';
                requestBody += '&client_id=' + radialTokenServiceClientID;
                requestBody += '&scope=' + radialTokenServiceScope;

                return requestBody;
            },
            parseResponse: function(svc, client) {
                return JSON.parse(client.text);
            },
            getResponseLogMessage: function(response) {
                try {
                    let msg = '';
                    let headers = response.getResponseHeaders();
                    for each(let header in headers.keySet()) {
                        if (headers.get(header) && headers.get(header)[0]) {
                            msg += header + ':' + headers.get(header)[0] + '\n';
                        }
                    }
                    msg += 'statusMessage:' + response.statusMessage + '\n';
                    msg += 'statusCode:' + response.statusCode + '\n';
                    msg += 'text:' + response.text + '\n';
                    msg += 'errorText:' + response.errorText + '\n';
                    return msg;
                } catch (e) {
                    return response;
                }
            },
            mockCall: function() {
                let requestObj = {
                    'access_token': 'eyJraWQiOiJBXC94WHJ5eVh3VnhPa1d6WDlVWHV6TEsyek50U2NuWDRrS250bGE2VzhoZz0iLCJhbGciOiJSUzI1NiJ9.eyJzdWIiOiI1b21kZWtiYWs5YmN0cW5yOWZxODJhdG9tZiIsInRva2VuX3VzZSI6ImFjY2VzcyIsInNjb3BlIjoiaG9zdGVkcGF5bWVudHMtdWF0XC93ZWItdWktanMiLCJhdXRoX3RpbWUiOjE3NTE2MzU2MjQsImlzcyI6Imh0dHBzOlwvXC9jb2duaXRvLWlkcC51cy13ZXN0LTIuYW1hem9uYXdzLmNvbVwvdXMtd2VzdC0yX0tOR3VBdjltRiIsImV4cCI6MTc1MTcyMjAyNCwiaWF0IjoxNzUxNjM1NjI0LCJ2ZXJzaW9uIjoyLCJqdGkiOiI3NmU4YmM1Yy01NWQyLTQyZmEtOWI2NS04MjQwYjQ3ZjI5ZGIiLCJjbGllbnRfaWQiOiI1b21kZWtiYWs5YmN0cW5yOWZxODJhdG9tZiJ9.i9rCjP-q363mLPfyOSgX3cc5bQAtLkVw-fCMQ3ZzRrwXK14z08WiqawQqKFPHTsu7QdZFsviMdo-w8-97duKd8NKYUH5nFDzqy8Y1H91PyJztCY9Y1As729TU-nrxQcE8uXfA8r1GFABo7cTPEdSQ-DpFy7QtQuyz8I0IGq1A3U9DCPIOnuhlIQA34BhCuVtXoxDs2frzorOYWjFtgx0Mo9vlFwKO1IgKdkExUOHHKneLAeD8oF3UliwABYuFmUvF-6lJDZVcDhcVk452xbGD31RoZ8qYvy_2O7hKw3grg3W-QvWD3qY_lGpbjefS3gkN4uF5K7sqsj0-SFwkMDYfw',
                    'expires_in': 86400,
                    'token_type': 'Bearer'
                };

                return {
                    statusCode: 200,
                    statusMessage: 'OK',
                    text: JSON.stringify(requestObj)
                };
            }
        }
    )
};
