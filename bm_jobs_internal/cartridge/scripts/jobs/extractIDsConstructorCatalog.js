var File = require('dw/io/File');
var Logger = require('dw/system/Logger');

function getNewestCatalogFile() {
    var folder = new File(File.IMPEX + '/src/constructor');
    var newestFile = null;

    var files = folder.listFiles(function(file) {
        return file.getName().startsWith('constructor-catalog-') && file.getName().endsWith('.json');
    })

    for (var i = 0; i < files.length; i++) {
        var file = files[i];
        if (!newestFile || file.lastModified() > newestFile.lastModified()) {
            newestFile = file;
        }
    };

    return newestFile;
}

function execute (params) {
    var FileReader = require('dw/io/FileReader');
    var FileWriter = require('dw/io/FileWriter');
    var Status = require('dw/system/Status');

    var catalogFile = getNewestCatalogFile();

    if (!catalogFile) {
        Logger.error('Catalog file not found');
        throw new Error;
    }

    new File(File.IMPEX + '/src/constructor/fileIDs').mkdirs();
    var productFile = new File(File.IMPEX + '/src/constructor/fileIDs/productIDs.txt');
    
    var reader = new FileReader(catalogFile, 'UTF-8');
    var writer = new FileWriter(productFile, 'UTF-8');

    var insideArray = false;
    var objectDepth = 0;
    var isBufferingObject = false;
    var currentObjectText = '';
    var idCount = 0;

    var insideString = false;
    var prevWasEscape = false;

    var productIDSet = new Set();

    function handleCompleteObject() {
        var productObj = JSON.parse(currentObjectText)

        var productId = productObj.id;


        if (productId) {
            if (!productIDSet.has(productId)) {
                productIDSet.add(productId);
                writer.writeLine(String(productId));
                idCount++;
            }
        }

        currentObjectText = '';
        isBufferingObject = false;
    };

    var line = reader.readLine()
    while (line !== null) {
        line += '\n';

        for (var i = 0; i < line.length; i++) {
            var char = line[i];

            if (isBufferingObject) currentObjectText += char;

            if (insideString) {
                if (prevWasEscape) { prevWasEscape = false; continue; }
                if (char === '\\') { prevWasEscape = true; continue; }
                if (char === '"') { insideString = false; }
                continue;
            } else if (char === '"') {
                insideString = true;
                continue;
            }

            if (!insideArray) {
                if (char === '[') insideArray = true;
                continue;
            }

            if (char === '{') {
                objectDepth++;
                if (!isBufferingObject && objectDepth === 1) {
                    isBufferingObject = true;
                    currentObjectText = '{';
                    continue;
                }
            }


            if (char === '}') {
                objectDepth--;
                if (isBufferingObject && objectDepth === 0) {
                    handleCompleteObject();
                }
            }
        }
        line = reader.readLine();
    }

    if (isBufferingObject && objectDepth === 0 && currentObjectText) {
        handleCompleteObject();
    }

    Logger.info('Wrote {0} product IDs to {1}', idCount, productFile);

    reader.close();
    writer.flush();
    writer.close();

    return new Status(Status.OK);
}

module.exports = {
    execute
}