var SFTPClient = require('dw/net/SFTPClient');
var File = require('dw/io/File');
var Logger = require('dw/system/Logger');

var sftp = new SFTPClient();

var host = 'connect-sftp.cnstrc.com';
var port = 22;

function main (params) {
    try {
        var username = params.UserID;
        var password = params.Password;
        var constructorKey = params.ConstructorKey;

        var localFile = new File(File.IMPEX + '/src/constructor/fileIDs/' + constructorKey + '_patch_delta_ignore.csv');

        sftp.connect(host, port, username, password);
    
        if (localFile.exists()) {
            sftp.putBinary(constructorKey + '_patch_delta_ignore.csv', localFile);
            Logger.info('SFTP upload successful: ' + localFile.getName());
        } else {
            Logger.error('Local file not found: ' + localFile.fullPath);
        }

        sftp.disconnect();
    } catch (e) {
        Logger.error('SFTP upload failed: ' + e.message);
        if (sftp.connected) {
            sftp.disconnect();
        }
    }
}

module.exports = {
    main
}
