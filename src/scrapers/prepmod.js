const SimpleScraper = require('./simpleScraperBase'),
      formatter = require('../availabilityFormatter'),
      req = require('../simpleRequest');
const cheerio = require('cheerio');

let headers = null;

class Prepmod extends SimpleScraper{

  scrape(){
    if(!headers){
      // first time initialization of the "singleton"
      this.logger.trace('init singleton');

      let parseResults;

      headers = new Promise((resolve, reject) => {
        req.getAndChaseRedirects(this.scrapeUrl, null, null, this, response => {

          parseResults = this.parse(response.data, this);

          resolve(response.config.headers);
        });
      });

      return formatter.format(headers.then(() => {
        return parseResults;
      }), this.uuid);
    }else{
      this.logger.trace('reusing cached headers');

      return formatter.format(headers.then(hds =>{
        return req.get(this.scrapeUrl, hds, null, this, response => this.parse(response.data, this))
      }), this.uuid);
    }
  }

  parse(html, that){
    const availabilityLocator = 'div.icon-chip',
          availabilityTableRowLocator = 'div.availability-table tr';
    const $ = cheerio.load(html);

    const availabilityIndicator = $(availabilityLocator).hasClass('available');

    let arr = [];
    if(availabilityIndicator){
      arr = $(availabilityTableRowLocator).map(function(i, el){
        const date = $(this).find('td:nth-child(1)').text(),
              count = $(this).find('td:nth-child(3)').text(),

              dateObj = new Date(date.trim() + 'GMT' + that.tz);

        const slotCount = parseInt(count || 0);

        if(slotCount > 0){
          return {
            allDay: true,
            date: dateObj.toISOString(),
            slots: slotCount
          }
        }else{
          return;
        }
      }).toArray();
      that.logger.trace(`Found ${arr.length} availability items`);
    }else{
      that.logger.trace(`Found unavailable`);
    }
    return arr;
  }
  
}

module.exports = Prepmod;