function execute (params) {
    var File = require('dw/io/File');
    var FileReader = require('dw/io/FileReader');
    var FileWriter = require('dw/io/FileWriter');
    var Status = require('dw/system/Status');
    var ProductMgr = require('dw/catalog/ProductMgr');
    var ProductInventoryMgr = require('dw/catalog/ProductInventoryMgr');
    var Logger = require('dw/system/Logger');
    
    var constructorKey = params.ConstructorKey;

    var productIDFile = new File(File.IMPEX + '/src/constructor/fileIDs/productIDs.txt');
    var finalCSVFile = new File(File.IMPEX + '/src/constructor/fileIDs/' + constructorKey + '_patch_delta_ignore.csv');

    var siteInventory = ProductInventoryMgr.getInventoryList();

    var storeInventoryListIDs = params && params.StoreIDS ? params.StoreIDS.split(',') : null;
    var storeInventoryList = null;

    if (storeInventoryListIDs) {
        storeInventoryList = storeInventoryListIDs.map(function (storeID) {
            //Splitting off the last 4 to get the inventory list- may change in the future
            var listID = storeID.slice(-4)
    
            var list = ProductInventoryMgr.getInventoryList(listID);
            if (!list) {
                Logger.warn('Store inventory list not found: {0}', listID)
            }
    
            return {id: storeID, list: list}
        })
    }

    var reader = new FileReader(productIDFile, 'UTF-8');
    var writer = new FileWriter(finalCSVFile, 'UTF-8');

    var headerColumns = [
        'productID',
        'ParentID',
        'online',
        'searchableIfUnavailable',
        siteInventory.getID()
    ];

    if (storeInventoryList) {
        storeInventoryList.forEach(function (store) {
            headerColumns.push(store.id);
        });
    }

    writer.writeLine(headerColumns.join(','));

    //ATS lookup helper
    function getATS(inventoryList, productID) {
        if (!inventoryList) return '';
        var record = inventoryList.getRecord(productID);
        return record ? record.getATS() : 0;
    }

    var processedCount = 0;
    var line = reader.readLine();
    while (line !== null) {
        var productID = (line || '').trim()
        if (productID) {
            var product = ProductMgr.getProduct(productID);

            var isOnline = product && product.online ? 'TRUE' : '';
            var isSearchable = product && product.searchableIfUnavailableFlag ? 'TRUE' : '';

            var SiteATS = getATS(siteInventory, productID);

            var rowColumns = [
                productID,
                '',
                isOnline,
                isSearchable,
                String(SiteATS)
            ]
            //Product master ID is left blank, as it is not used
            if (storeInventoryList) {
                storeInventoryList.forEach(function (store) {
                    rowColumns.push(String(getATS(store.list, productID)))
                })
            }

            writer.writeLine(rowColumns.join(','));
            processedCount++;
        }
        line = reader.readLine();     
    }

    reader.close();
    writer.flush();
    writer.close();

    return new Status(Status.OK)
}

module.exports = {
    execute
}