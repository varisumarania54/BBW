'use strict';

const Logger = require('dw/system/Logger');
const Status = require('dw/system/Status');

function hookVersionRouter(type, scriptPath) {
    return function() {
        let version = request.httpParameterMap.c_version.stringValue;
        let versionSuffix = (!empty(version)) ? '_v' + version : '';
        let fullPath = scriptPath + versionSuffix;
        try {
            return require(fullPath)[type].apply(this, arguments);
        } catch (e) {
            Logger.error('hookVersionRouter error for hook type {0}, version {1} at path {2}: {3}', type, version || 'default', fullPath, e.message);
            return new Status(Status.ERROR, 'HOOK_VERSION_ERROR', 'Failed to load hook type "' + type + '" version "' + (version || 'default') + '" at path: ' + fullPath + '. Error: ' + e.message);
        }
    };
}

exports.hookVersionRouter = hookVersionRouter;