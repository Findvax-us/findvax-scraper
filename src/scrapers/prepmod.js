const SimpleScraper = require('./simpleScraperBase'),
      formatter = require('../availabilityFormatter'),
      req = require('../simpleRequest');
const cheerio = require('cheerio');

let cache = null;

class Prepmod extends SimpleScraper{

  scrape(){
    if(!cache){
      // first time initialization of the "singleton"
      this.logger.trace('init singleton');

      let parseResults;

      cache = new Promise((resolve, reject) => {
        req.getAndChaseRedirects(this.scrapeUrl, null, null, this, response => {

          parseResults = this.parse(response.data, this);

          resolve({
            headers: response.config.headers,
            url: response.config.url
          });

        });
      });

      return formatter.format(cache.then(() => {
        return parseResults;
      }), this.uuid);
    }else{
      this.logger.trace('reusing cached data');

      return formatter.format(cache.then(cached =>{
        return req.get(cached.url, cached.headers, null, this, response => this.parse(response.data, this))
      }), this.uuid);
    }
  }

  parse(html, that){
    const availabilityLocator = 'div.icon-chip',
          availabilityTableRowLocator = 'div.availability-table tr';
    const $ = cheerio.load(html);

    const availabilityIndicator = $(availabilityLocator).hasClass('available');

    let arr = [];
    if(availabilityLocator){
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