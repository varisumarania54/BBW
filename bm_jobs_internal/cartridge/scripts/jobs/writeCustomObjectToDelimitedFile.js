'use strict';

const File = require('dw/io/File');
const FileWriter = require('dw/io/FileWriter');
const CustomObjectMgr = require('dw/object/CustomObjectMgr');
const Calendar = require('dw/util/Calendar');
const StringUtils = require('dw/util/StringUtils');
const Transaction = require('dw/system/Transaction');
const Logger = require('dw/system/Logger');
const Status = require('dw/system/Status');

/**
 * Functions used write custom objects to delimited file
 * @namespace WriteCustomObjectDelimitedFile
 */

/**
 * Grabs the slots and configures them for the response object
 * @function createFile
 * @memberof WriteCustomObjectDelimitedFile
 * @param {String} writePath - file write path
 * @return {Object} - new file and file writer
 */
function createFiles(writePath, type) {
    let file = null;
    let fileWriter = null;
    try {
        let newFilePath = `${File.IMPEX}${File.SEPARATOR}${writePath.replace('/', File.SEPARATOR)}`;
        let calendar = new Calendar(new Date());
        calendar.setTimeZone('EST');

        let timestamp = StringUtils.formatCalendar((calendar), 'yyyyMMdd\'T\'HHmmssSSS').toUpperCase();
        newFilePath = newFilePath.replace('{0}', timestamp);

        file = new File(newFilePath);
        fileWriter = new FileWriter(file);
    } catch (e) {
        Logger.error('Error in createFile: {0}', e);
        throw new Status(Status.ERROR, 'ERROR', e.message);
    }
    return {
        file,
        fileWriter
    }
}

/**
 * Formats date into specified format
 * @function formatDate
 * @memberof WriteCustomObjectDelimitedFile
 * @param {String} dateStr - date in string format
 * @return {String} - date in the desired format
 */
function formatDate(date, format) {
    let cal = new Calendar(date instanceof Date ? date : new Date(date));
    cal.setTimeZone('EST');
    return StringUtils.formatCalendar((cal), format).toUpperCase();
}

/**
 * Finds the custom object group to export and returns headerLine and fields for subsequent lineWrites
 * @function buildHeaderMapping
 * @memberof WriteCustomObjectDelimitedFile
 * @param {String} type - the custom object type to export
 * @param {String} group - the custom object attribute group to export
 * @param {String} delimiter - use to join the headers into a string (headerLine)
 * @return {Object} - headerLine for writing the file headers and fields to export on new lines
 */
function buildHeaderMapping(group, type, delimiter) {
    let objDef = CustomObjectMgr.describe(type);
    let objGroup = objDef.getAttributeGroup(group);
    if (!objGroup) {
        throw new Error(`Custom Object type '${type}' does not contain group: '${group}'`);
    }
    let attributeDefinitions = objGroup.getAttributeDefinitions().toArray();
    let fields = [];
    let attributesNames = [];
    for (let key in attributeDefinitions) {
        let definition = attributeDefinitions[key];
        let displayName = definition.displayName;
        attributesNames.push(displayName);
        fields.push({ id: definition.ID, type: definition.valueTypeCode });
    }
    return { headerLine: attributesNames.join(delimiter), fields };
}


/**
 * Models custom attributes in a particular custom object type and group into a line for fileWriter
 * @function buildLine
 * @memberof WriteCustomObjectDelimitedFile
 * @param {Array} fields - list of fields to model data and join to line
 * @param {Object} customObject - iterations custom object
 * @param {String} delimiter - use to join attributes into a string
 * @return {String} - line for fileWriter
 */
function buildLine(fields, customObject, delimiter, exportattributeDateFormat) {
    let customAttributes = customObject.getCustom();
    let line = '';
    fields.forEach(field => {
        let key = field.id;
        let attribute;
        if (key in customAttributes) {
            attribute = customAttributes[key];
        } else if (key in customObject) {
            attribute = customObject[key];
        } else {
            attribute = '';
        }
        let value = field.type === 11 && !empty(exportattributeDateFormat) && !empty(attribute) ? formatDate(attribute, exportattributeDateFormat) : attribute;
        line = line.concat(value, delimiter);

    })

    return line.substr(0, line.lastIndexOf(delimiter));
}

/**
 * Iterates custom object query starting on the retention threshold and ascending recursively to current time
 * @function batchQuery
 * @memberof WriteCustomObjectDelimitedFile
 * @param {String} type - custom object type
 * @param {Date} nextQueryStart - limits creationDates returned for each iteration
 * @param {Number} batchQueryRangeInMinutes - increment query date for crawling through time
 * @param {Array} batches - contains all seekableIterators with results
 * @param {Number} count - running total of all custom objects found
 * @return {Array} - batches of valid seekerIterable custom object results
 */
function batchQuery(type, nextQueryStart, batchQueryRangeInMinutes, batches, count) {
    let results = CustomObjectMgr.queryCustomObjects(type, 'creationDate <= {0}', 'creationDate asc', nextQueryStart.toISOString());
    if (results && results.count < 1) {
        results.close();
    }
    let resultsCount = results && results.count || 0;
    if (resultsCount < 1 || nextQueryStart < new Date()) {
        count = count + resultsCount;
        batches.push(results);
        nextQueryStart = new Date(nextQueryStart.getTime() + (batchQueryRangeInMinutes * 60 * 1000));
        batchQuery(type, nextQueryStart, batchQueryRangeInMinutes, batches, count);
    }
    return batches;
}

/**
 * Main function for reading, processing, and writing custom object data to a delimited file (single threaded)
 * @function buildLine
 * @memberof WriteCustomObjectDelimitedFile
 * @param {Object} parameters - running total of custom objects processed
 * @param {Object} stepExecution - maximum records written to file
 * @return {Status} - job exit status
 */
function writeCustomObjectToDelimitedFile(parameters, stepExecution) {
    let jobStatus = new Status(Status.OK);
    let totalProcessed = 0;
    let file = null;
    let fileWriter = null;

    const type = parameters.Type;
    const group = parameters.Group;
    const writePath = parameters.WritePath;
    const delimiter = parameters.Delimiter;

    const startQueryDateInDays = parameters.StartQueryDateInDays;
    const batchQueryRangeInMinutes = parameters.BatchQueryRangeInMinutes;
    const attributeDateFormat = parameters.AttributeDateFormat || 'MM/dd/yyyy HH:mm:ss a';

    try {
        let queryStartTime = startQueryDateInDays ? (startQueryDateInDays * 24 * 60 * 60 * 1000) + (batchQueryRangeInMinutes * 60 * 1000) : (batchQueryRangeInMinutes * 60 * 1000);
        let queryStartDate = new Date(new Date().getTime() - queryStartTime);
        let batches = batchQuery(type, queryStartDate, batchQueryRangeInMinutes, [], 0);

        if (batches.length < 1) {
            Logger.info('No objects found of type: {0} found', type);
            return jobStatus;
        }

        let impexFiles = createFiles(writePath, type);
        file = impexFiles.file;
        fileWriter = impexFiles.fileWriter;
        Logger.info('File initialized: {0} for type: {1}', file, type);

        let { headerLine, fields } = buildHeaderMapping(group, type, delimiter);
        if (typeof headerLine !== 'string') throw new Error(`Failed to create file's header line`);
        fileWriter.writeLine(headerLine);

        batches.forEach(seekableIterator => {
            while (seekableIterator && seekableIterator.hasNext()) {
                let customObject = seekableIterator.next();
                let line = buildLine(fields, customObject, delimiter, attributeDateFormat);
                fileWriter.writeLine(line);

                Transaction.wrap(() => {
                    CustomObjectMgr.remove(customObject);
                    Logger.info('Removed custom object record: {0}', customObject.UUID);
                });

                totalProcessed = totalProcessed + 1;
            }
            seekableIterator.close();
        });
        Logger.info('Wrote {0} records to {1}', totalProcessed, file);
    } catch (e) {
        Logger.error('Error in read: {0}', e);
        jobStatus = new Status(Status.ERROR, 'ERROR', e.message);
    }

    // close utilies memory usage
    if (fileWriter instanceof dw.io.FileWriter) {
        fileWriter.close();
        fileWriter = null;
    }

    return jobStatus;
}

module.exports = {
    writeCustomObjectToDelimitedFile
}
