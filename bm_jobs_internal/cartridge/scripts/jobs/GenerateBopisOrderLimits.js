'use strict';

const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;
const Status = require('dw/system/Status');
const FileWriter = require('dw/io/FileWriter');
const XMLStreamWriter = require('dw/io/XMLStreamWriter');
const CSVStreamReader = require('dw/io/CSVStreamReader');
const FileReader = require('dw/io/FileReader');
const File = require('dw/io/File')
const defOrderQty = 0;
const defBopisLimitReached = false;

/**
 * @namespace GenerateBopisOrderLimitsBopisOrderLimits
 * @memberof Jobs
 */

const daysOfTheWeek = [
    {standard: 'Sunday', abr: 'Sun'},
    {standard: 'Monday', abr: 'Mon'},
    {standard: 'Tuesday', abr: 'Tue'},
    {standard: 'Wednesday', abr: 'Wed'},
    {standard: 'Thursday', abr: 'Thu'},
    {standard: 'Friday', abr: 'Fri'},
    {standard: 'Saturday', abr: 'Sat'}
];

/**
 * @name getFileName
 * @param {string} fileName
 * @param {string} fileType 
 * @param {*} dayOfWeek 
 * @returns {string}
 * @description gets file name aggregated with params
 */
function getFileName(fileName, dayOfWeek, fileType) {
    let finalFileName = '';
    if (!empty(fileName) && !empty(fileType) && !empty(dayOfWeek)) {
        finalFileName = fileName + ' ' + dayOfWeek + fileType;
    } else {
        finalFileName = fileName + fileType;
    }
    return finalFileName;
}

/**
 * @name getNextDay
 * @returns {*}
 * @description returns the next day name object
 */
function getNextDay() {
    let today = Date.now();
    let tomorrow = new Date(today.valueOf() + 86400000);
    let tomorrowDayOfWeek = daysOfTheWeek[tomorrow.getDay()];
    return tomorrowDayOfWeek;
}

/**
 * @function GenerateBopisOrderLimits
 * @param {*} params 
 * @returns {*}
 * @description executes the job to generate the bopis order limits custom objects
 */
exports.GenerateBopisOrderLimits = function (params) {
    if (!empty(params.inputFileName)  && !empty(params.outputFileName) && !empty(params.inputFolderPath) && !empty(params.outputFolderPath)){

        new File(File.IMPEX + File.SEPARATOR + params.inputFolderPath).mkdirs();
        new File(File.IMPEX + File.SEPARATOR + params.outputFolderPath).mkdirs();

        let csvFileName = getFileName(params.inputFileName, getNextDay().standard, '.csv');
        let file = new File(File.IMPEX + File.SEPARATOR + params.inputFolderPath + File.SEPARATOR + csvFileName);

        if (file.exists()) {
            let xmlFileName = getFileName(params.outputFileName, '', '.xml');
            let outputFile = new File(File.IMPEX + File.SEPARATOR + params.outputFolderPath + File.SEPARATOR + xmlFileName);
            outputFile.createNewFile();

            let csvReader = new CSVStreamReader(new FileReader(file, 'UTF-8'));
            let xmlWriter = new XMLStreamWriter(new FileWriter(outputFile));

            try {
                let csvLine = csvReader.readNext();

                // <custom-objects xmlns="http://www.demandware.com/xml/impex/customobject/2006-10-31">
                xmlWriter.writeStartDocument('UTF-8', '1.0');
                xmlWriter.writeCharacters('\n');
                xmlWriter.writeStartElement('custom-objects'); //starts <custom-objects>
                xmlWriter.writeAttribute('xmlns', 'http://www.demandware.com/xml/impex/customobject/2006-10-31');
        
                while (csvLine != null) {
                    //<custom-object object-id="BBW00010" type-id="BopisStores">
                    xmlWriter.writeStartElement('custom-object'); //starts <custom-object>
                    xmlWriter.writeAttribute('object-id', `${!empty(csvLine[0]) ? csvLine[0] : ''}`);
                    xmlWriter.writeAttribute('type-id', 'BopisStores');
        
                    // <object-attribute attribute-id="OrderLimit">225</object-attribute>
                    xmlWriter.writeStartElement('object-attribute');
                    xmlWriter.writeAttribute('attribute-id', 'OrderLimit');
                    xmlWriter.writeCharacters(`${!empty(csvLine[1]) ? csvLine[1] : ''}`); //225, 175, 150
                    xmlWriter.writeEndElement(); //ends </object-attribute>
        
                    // <object-attribute attribute-id="OrderQty">0</object-attribute>
                    xmlWriter.writeStartElement('object-attribute');
                    xmlWriter.writeAttribute('attribute-id', 'OrderQty');
                    xmlWriter.writeCharacters(`${defOrderQty}`); // 0
                    xmlWriter.writeEndElement(); //ends </object-attribute>
        
                    // <object-attribute attribute-id="bopisLimitReached">false</object-attribute>
                    xmlWriter.writeStartElement('object-attribute');
                    xmlWriter.writeAttribute('attribute-id', 'bopisLimitReached');
                    xmlWriter.writeCharacters(`${defBopisLimitReached}`); // false
                    xmlWriter.writeEndElement(); //ends </object-attribute>
        
                    xmlWriter.writeEndElement(); //ends <custom-object>

                    csvLine = csvReader.readNext();
                }
        
                xmlWriter.writeEndElement(); //closes </custom-objects>
                return new Status(Status.OK);
            } catch (e) {
                outputFile.remove();
                logHandler.logger.error(e, 'Jobs', 'BopisOrderLimits');
                return new Status(Status.ERROR, 'ERROR', e);
            } finally {
                csvReader.close();
                xmlWriter.close();
            }
        } else {
            logHandler.logger.error('File Does Not Exist', 'Jobs', 'BopisOrderLimits');
            return new Status(Status.ERROR, 'NO FILES', 'No files to import in folder ' + file);
        }
    } else {
        logHandler.logger.error('Invalid Params', 'Jobs', 'BopisOrderLimits');
        return new Status(Status.ERROR, 'INVALID', 'Invalid Params');
    }
}