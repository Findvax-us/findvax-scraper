const config = require('../config'),
      SimpleScraper = require('./simpleScraperBase'),
      req = require('../simpleRequest'),
      formatter = require('../availabilityFormatter');
const cheerio = require('cheerio');
      dayjs = require('dayjs'),
      customParseFormat = require('dayjs/plugin/customParseFormat');
dayjs.extend(customParseFormat);

class SPHP extends SimpleScraper{

  static dateFormat = 'MM/DD/YYYY HHmm A Z';

  scrape(){
    const headers = {
      Cookie: this.params.cookie,
      'X-Requested-With': 'XMLHttpRequest'
    };
    let promiseQ = [];

    for(let i = config.sphp.daysToSearch + config.sphp.startDayOffset; i >= config.sphp.startDayOffset; i--){

      let today = new Date(new Date().toDateString() + ' GMT' + this.tz),
          newDate = new Date(today.setDate(today.getDate() + i)),
          year = newDate.getFullYear(),
          month = newDate.getMonth() + 1,
          day = newDate.getDate();
       
      const body = `ScheduleDay=${month}/${day}/${year}`;

      promiseQ.push(
        req.post(this.scrapeUrl, body, headers, null, this, response => this.parse(response.data, this))
      );
    } 

    return formatter.format(Promise.all(promiseQ).then(results => {
      return results.flat(1).reverse();
    }), this.uuid);
  }

  parse(html, that){
    
    const noAvailabilityString = 'There are no open appointments on this day. Please try another day.',
          datepickerLocator = 'input#datepicker',
          availabilityLocator = 'div.row:last-child div.well',
          timeSlotLocator = `${availabilityLocator} div.row > div.text-left`;

    const $ = cheerio.load(html),
          dateString = $(datepickerLocator).val(),
          availableString = $(availabilityLocator).text().trim();

    if(html.includes(noAvailabilityString) || (availableString && availableString === noAvailabilityString)){
      that.logger.info(`No time slots available on ${dateString ? dateString : 'UNKNOWN'}`);
      return [];
    }else{

      let result = [];
      result = $(timeSlotLocator).map(function(){

        let timeSlotString = $(this).text().trim().split(' - ')[0], // looks like: '01:15 PM - 01:30 PM'
            dateObj = dayjs(`${dateString} ${timeSlotString} ${that.tz}`, SPHP.dateFormat);

        return {
          allDay: false,
          date: dateObj.toISOString(),
          slots: null
        }
      }).toArray();

      return result;

    }

  }
  
}

module.exports = SPHP;