const config = require('../config'),
      SimpleScraper = require('./simpleScraperBase'),
      req = require('../simpleRequest'),
      formatter = require('../availabilityFormatter');
const cheerio = require('cheerio');
      dayjs = require('dayjs'),
      customParseFormat = require('dayjs/plugin/customParseFormat');
dayjs.extend(customParseFormat);

class SPHP extends SimpleScraper{

  static dateFormat = 'MM/DD/YYYY HHmm Z';

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
      return results.flat(1);
    }), this.uuid);
  }

  parse(html, that){
    // this is just a dumb negative check right now that assumes anything other than the "nope bye!"
    // message means there is some unknown amount of availability on that day. until we see a
    // response with positive availability we don't know exactly how to parse it, so this 
    // can likely be improved in the future with some sample html (lol its html)

    const noAvailabilityString = 'There are no open appointments on this day. Please try another day.',
          datepickerLocator = 'input#datepicker',
          availabilityLocator = 'div.row:last-child div.well';

    const $ = cheerio.load(html),
          dateString = $(datepickerLocator).val(),
          resultString = $(availabilityLocator).text().trim();

    if(html.includes(noAvailabilityString) || (resultString && resultString === noAvailabilityString)){
      that.logger.info(`No time slots available on ${dateString ? dateString : 'UNKNOWN'}`);
      return [];
    }else{
      that.logger.info('Time slots found! Full html output in next log. Use this to make it work better!');
      that.logger.info(html);

      let dateObj = dayjs(`${dateString} 00:00 ${that.tz}`, SPHP.dateFormat);

      return {
        allDay: true,
        date: dateObj.toISOString(),
        slots: null
      }
    }

  }
  
}

module.exports = SPHP;