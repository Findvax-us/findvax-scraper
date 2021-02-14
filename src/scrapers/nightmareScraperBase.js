const config = require('../../config'),
      Scraper = require('./base');
const Nightmare = require('nightmare');

class NightmareScraper extends Scraper{

  constructor(logger, url, uuid, tz, params, locationName){
    super(logger, url, uuid, tz, params, locationName);

    let opts = {};
    if(config.debug){
      opts.openDevTools = {
        mode: 'detach'
      };
      opts.show = true;
    }
    this.nightmare = Nightmare(opts);
  }
}

module.exports = NightmareScraper;