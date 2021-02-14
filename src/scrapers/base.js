const config = require('../../config');
const bunyan = require('bunyan');

class Scraper{

  constructor(logger, url, uuid, tz, params, locationName){

    const logTemplate = {
      location: {
        name: locationName,
        uuid: uuid
      },
      scraperClass: this.constructor.name
    }

    this.logger = logger.child(logTemplate);

    this.logger.trace('Constructing');

    this.url = url;
    this.uuid = uuid;
    this.tz = tz;
    this.params = params;
  }

  get scrapeUrl(){
    return this.url;
  }

  scrape(){
    const msg = "Not implemented! Someone called a base scraper's `scrape()` which should not happen.";
    this.logger.fatal(msg);
    throw msg;
  }

  parse(){
    const msg = "Not implemented! Someone called a base scraper's `parse()` which should not happen.";
    this.logger.fatal(msg);
    throw msg;
  }

}

module.exports = Scraper;