'use strict';
/**
 * A namespace.
 * @namespace EstimatedShipping
 */
const Calendar = require('dw/util/Calendar');
const Site = require('dw/system/Site').getCurrent();
const logHandler = require('app_composable/cartridge/scripts/helpers/util/logHandler.js').logHandler;
const StringUtils = require('dw/util/StringUtils');

/**
 * Sets the passed in calendar object with the passed in time quantities
 * @function setCutoffCalendar
 * @memberof EstimatedShipping
 * @param {Calendar} calendar - calendar object
 * @param {Number} hour - The number hour the calendar will be set at
 * @param {Number} minute - The number minute the calendar will be set at
 * @return {Calendar} - The updated calendar
 */
function setCutoffCalendar(calendar, hour, minute) {
    calendar.set(Calendar.HOUR_OF_DAY, hour);
    calendar.set(Calendar.MINUTE, minute);
    calendar.set(Calendar.SECOND, 0);
    calendar.set(Calendar.MILLISECOND, 0);

    return calendar;
}

/**
 * Adds business Days to the calendar adn return the calender after adding one.
 * @function addBusinessDay
 * @memberof EstimatedShipping
 * @param {Calendar} calendar - calendar object
 * @param {Boolean} saturdaysIsBusinessDay - bool determining if saturday is considered a business day
 * @return {Calendar} - The updated calendar
 */
function addBusinessDay(calendar, saturdaysIsBusinessDay) {
	if (isBusinessDay(calendar, saturdaysIsBusinessDay)) {
		return calendar;
	} else {
		calendar.add(Calendar.DAY_OF_MONTH, 1);
		return addBusinessDay(calendar, saturdaysIsBusinessDay);
	}
}

/**
 * Returns if the passed in calendar is on a business day.
 * @function isBusinessDay
 * @memberof EstimatedShipping
 * @param {Calendar} calendar - calendar object
 * @param {Boolean} saturdaysIsBusinessDay - bool determining if saturday is considered a business day
 * @return {Boolean} - true if the calendar lands on a business day
 */
function isBusinessDay(calendar, saturdaysIsBusinessDay) {
	const holiday = isHoliday(calendar);
	const weekend = isWeekend(calendar, saturdaysIsBusinessDay);
	return !holiday && !weekend;
}

/**
 * Returns if the passed in calendar is on a holiday.
 * @function isHoliday
 * @memberof EstimatedShipping
 * @param {Calendar} calendar - calendar object
 * @return {Boolean} - true if the calendar lands on a holiday
 */
function isHoliday(calendar) {
	const holidays = Site.getCustomPreferenceValue('estimatedDeliveryHolidays');
	if (empty(holidays)) {
		return false;
	}
	else {
		return holidays.some(holiday => {
			let newHolidayCalendar = new Calendar();
			newHolidayCalendar.setTimeZone(dw.system.System.getInstanceTimeZone());
			newHolidayCalendar.parseByFormat(holiday, 'MM/dd/yyyy');
			return calendar.isSameDayByTimestamp(newHolidayCalendar);
		});
	}
}

/**
 * Returns if the passed in calendar is on a weekend.
 * @function isWeekend
 * @memberof EstimatedShipping
 * @param {Calendar} calendar - calendar object
 * @param {Boolean} saturdaysIsBusinessDay - bool determining if saturday is considered a business day
 * @return {Boolean} - true if the calendar lands on a weekend
 */
function isWeekend(calendar, saturdaysIsBusinessDay) {
	let newDate = calendar.getTime();
	return (!saturdaysIsBusinessDay && newDate.getDay() == 6) || newDate.getDay() == 0
}

/**
 * Returns the shipping value that corosponds to the passed in delivery Mode.
 * @function shippingMapping
 * @memberof EstimatedShipping
 * @param {String} shipMethodRadial - Shipping mode
 * @return {String} - the Shipping value that maps to the passed in shipping delivery mode
 */
function shippingMapping(shipMethodRadial) {
	const shippingMethodsRadial = JSON.parse(Site.getCustomPreferenceValue('shippingMethodsRadial'));
	let foundData = shippingMethodsRadial.find(e => e.DeliveryMode == shipMethodRadial);
	return !empty(foundData) ? foundData.ShippingValue : '';
}

/**
 * Data corresponding to the estimated delivery date based on the passed in shipping method.
 * @function calculateDeliveryDates
 * @memberof EstimatedShipping
 * @param {Calendar} calendar
 * @param {String} shippingMethodID
 * @param {Object} [locale]
 * @param {Object} [passedShippingMethod]
 * @return {Object}
 */
function calculateDeliveryDates(calendar, shippingMethodID, locale, passedShippingMethod) {
	let result = {
		success: true
	};

	try {
		if (calendar == null) {
			calendar = new dw.util.Calendar();
		}
		let calendarStartTime = calendar;
		let calendarCutOff = new Calendar(calendarStartTime.getTime());
		let shipDays, shipDays2;
		const timeZone = Site.getCalendar().timeZone;
		calendarStartTime.setTimeZone(timeZone);
		calendarCutOff.setTimeZone(timeZone);
		let includeSaturdays = false;

        if (!empty(passedShippingMethod)) {
            result.cutOffTimes = passedShippingMethod.custom.cutOffTimes;
            result.shippingDates = passedShippingMethod.custom.shippingDates;
            includeSaturdays = Site.getCustomPreferenceValue('estimatedDeliveryDateIncludeSaturdaysFeatureToggle') && 'includeSaturdaysInEstimatedDeliveryDate' in passedShippingMethod.custom && passedShippingMethod.custom.includeSaturdaysInEstimatedDeliveryDate;
        }
        else {
            let shippingMethods = dw.order.ShippingMgr.getAllShippingMethods().toArray();
			shippingMethods.every(method => {
				if (method.ID === shippingMethodID) {
					result.cutOffTimes = method.custom.cutOffTimes;
                    result.shippingDates = method.custom.shippingDates;
                    includeSaturdays = Site.getCustomPreferenceValue('estimatedDeliveryDateIncludeSaturdaysFeatureToggle') && 'includeSaturdaysInEstimatedDeliveryDate' in method.custom && method.custom.includeSaturdaysInEstimatedDeliveryDate;
                    return false;
				}
				return true;
			})
        }

		if (empty(result.shippingDates)) {
			let defaultShippingMethod = dw.order.ShippingMgr.getDefaultShippingMethod();
			if (shippingMethodID == defaultShippingMethod.ID) {
				result.cutOffTimes = defaultShippingMethod.custom.cutOffTimes;
				result.shippingDates = defaultShippingMethod.custom.shippingDates;
			}
		}

		if (!empty(result.cutOffTimes)) {
			let cutoffHour = new Number(result.cutOffTimes.split(':')[0]);
			let cutoffMin = new Number(result.cutOffTimes.split(':')[1]);
            calendarCutOff = setCutoffCalendar(calendarCutOff, cutoffHour, cutoffMin);
		}

		// check if calendarStartTime business day (cutoff times)
		if (calendarStartTime.compareTo(calendarCutOff) > 0 && isBusinessDay(calendarStartTime, includeSaturdays)) {
			calendarStartTime.add(Calendar.DAY_OF_MONTH, 1);
		}
		// check if calendarStartTime business day (cutoff times)
		if (!isBusinessDay(calendarStartTime, includeSaturdays)) {
			addBusinessDay(calendarStartTime, includeSaturdays);
		}

		let calendarEndTime = new Calendar(calendarStartTime.getTime());
		let calendarEndTime2 = new Calendar(calendarStartTime.getTime());
		calendarEndTime.setTimeZone(timeZone);
		calendarEndTime2.setTimeZone(timeZone);

		//add first day as 0 day; if 1 business day - delivery will be next day.
		calendarEndTime.add(Calendar.DAY_OF_MONTH, 1);
		calendarEndTime2.add(Calendar.DAY_OF_MONTH, 1);

        if (!empty(result.shippingDates)) {
            if (result.shippingDates.indexOf('-') == -1) {
                shipDays = parseInt(result.shippingDates.split('-')[0]);
                let i = 0;

                while (i < shipDays) {
                    // if today business day
                    if (isBusinessDay(calendarEndTime, includeSaturdays)) {
                        i++;
                    }
                    if (i == shipDays) {
                        break;
                    }
                    calendarEndTime.add(Calendar.DAY_OF_MONTH, 1);
                }
            } else {
                shipDays = parseInt(result.shippingDates.split('-')[0]);
                shipDays2 = parseInt(result.shippingDates.split('-')[1]);

                let i = 0;

                while (i < shipDays) {
                    // if today business day
                    if (isBusinessDay(calendarEndTime, includeSaturdays)) {
                        i++;
                    }
                    if (i == shipDays) {
                        break;
                    }
                    calendarEndTime.add(Calendar.DAY_OF_MONTH, 1);
                }

                i = 0;

                while (i < shipDays2) {
                    // if today business day
                    if (isBusinessDay(calendarEndTime2, includeSaturdays)) {
                        i++;
                    }
                    if (i == shipDays2) {
                        break;
                    }
                    calendarEndTime2.add(Calendar.DAY_OF_MONTH, 1);
                }
            }
        }

		result.calendarCutOff = StringUtils.formatCalendar(calendarCutOff, 'yyyy-MM-dd HH:mm:ss z');
		calendarEndTime.setTimeZone("GMT");
		result.calendarEndTimeFormated = StringUtils.formatCalendar(calendarEndTime, 'E MMM dd').replace('Tue', 'Tues').replace('Thu', 'Thurs');
		result.calendarEndTimeFormatedEmail = StringUtils.formatCalendar(calendarEndTime, 'MMM dd');
		calendarStartTime.setTimeZone("GMT");
		result.calendarStartTime = StringUtils.formatCalendar(calendarStartTime, 'yyyy-MM-dd HH:mm:ss z');
		result.calendarEndTime = StringUtils.formatCalendar(calendarEndTime, 'yyyy-MM-dd HH:mm:ss z');
		result.calendarEndTimeRadial = StringUtils.formatCalendar(calendarEndTime, 'MMddyyyy');
		if (!empty(result.shippingDates) && result.shippingDates.indexOf('-') > -1) {
			calendarEndTime2.setTimeZone("GMT");
			result.calendarEndTime2Radial = StringUtils.formatCalendar(calendarEndTime2, 'MMddyyyy');
			result.calendarEndTime2 = StringUtils.formatCalendar(calendarEndTime2, 'yyyy-MM-dd HH:mm:ss z');
			result.calendarEndTimeFormated2 = StringUtils.formatCalendar(calendarEndTime2, 'E MMM dd').replace('Tue', 'Tues').replace('Thu', 'Thurs');
			result.calendarEndTimeBothDates = StringUtils.formatCalendar(calendarEndTime, 'E MMM dd').replace('Tue', 'Tues').replace('Thu', 'Thurs') + ' - ' + dw.util.StringUtils.formatCalendar(calendarEndTime2, 'E MMM dd').replace('Tue', 'Tues').replace('Thu', 'Thurs');
			result.calendarEndTimeBothDatesEmail = locale && locale === 'fr_CA' ? StringUtils.formatCalendar(calendarEndTime, 'dd MMM') + ' - ' + dw.util.StringUtils.formatCalendar(calendarEndTime2, 'dd MMM') : StringUtils.formatCalendar(calendarEndTime, 'MMM dd') + ' - ' + dw.util.StringUtils.formatCalendar(calendarEndTime2, 'MMM dd');
		}
		result.shippingMethod = shippingMethodID;

	} catch (e) {
		result.success = false;
		logHandler.logger.error(e, 'Util', 'estimatedShip');
	}
	return result;
}

module.exports = {
	calculateDeliveryDates
};
