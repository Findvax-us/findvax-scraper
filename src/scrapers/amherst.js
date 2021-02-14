const SimpleScraper = require('./simpleScraperBase');
const cheerio = require('cheerio'),
      dayjs = require('dayjs'),
      customParseFormat = require('dayjs/plugin/customParseFormat');
dayjs.extend(customParseFormat);

class Amherst extends SimpleScraper{

  parse(html, that){
    const listLocator = 'li:contains("Click here to register")';

    const $ = cheerio.load(html);
    let arr = $(listLocator).map(function(i, el){
      const splitDate = $(this).text().split(', ')[1].split(' - ')[0],
            dateString = `${splitDate} ${new Date().getFullYear()} ${that.tz}`,
            dateObj = dayjs(dateString, "MMMM Do h:mm a YYYY Z");

      return {
        allDay: false,
        date: dateObj.toISOString(),
        slots: null
      }
    }).toArray();

    that.logger.trace(`Found ${arr.length} available slots`);

    return arr;
  }
  
}

module.exports = Amherst;