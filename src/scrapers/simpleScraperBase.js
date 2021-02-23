const config = require('../config'),
      Scraper = require('./base'),
      req = require('../simpleRequest'),
      formatter = require('../availabilityFormatter');

class SimpleScraper extends Scraper{

  scrape(){
    return formatter.format(req.get(this.scrapeUrl, null, null, this, this.parse), this.uuid);
  }
  
}

module.exports = SimpleScraper;