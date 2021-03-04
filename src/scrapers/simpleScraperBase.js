const config = require('../config'),
      Scraper = require('./base'),
      req = require('../simpleRequest'),
      formatter = require('../availabilityFormatter');

class SimpleScraper extends Scraper{

  scrape(){
    return formatter.format(
      req.getAndChaseRedirects(this.scrapeUrl, null, null, this, response => this.parse(response.data, this)), 
      this.uuid);
  }
  
}

module.exports = SimpleScraper;