const config = require('../config'),
      formatter = require('../availabilityFormatter'),
      req = require('../simpleRequest'),
      SimpleScraper = require('./simpleScraperBase');

// given the way we load modules and classes, 
// this is effectively a quick n dirty singleton property
let cachedResponse = {};

class CVS extends SimpleScraper{

  static headers = {
    Referer: 'https://www.cvs.com/immunizations/covid-19-vaccine'
  };

  get availability(){
    if(!cachedResponse[this.params.segmentId] || typeof cachedResponse[this.params.segmentId] !== 'object'){
      // first time initialization of the "singleton"
      this.logger.trace('init singleton');
      cachedResponse[this.params.segmentId] = req.get(this.scrapeUrl, CVS.headers, null, this, response => response.data);
    }else{
      this.logger.trace('reusing cached results');
    }

    return cachedResponse[this.params.segmentId];
  }

  scrape(){
    return formatter.format(this.parse(this.availability, this), this.uuid);
  }

  parse(jsonPromise){
    return jsonPromise.then(json => {
      const data = JSON.parse(json),
            items = data.responsePayloadData.data[this.params.segmentId.toUpperCase()];

      const loc = items.find(l => l.city === this.params.locationName);
      if(loc){
        if(loc.status === 'Fully Booked'){
          return [null];
        }

        this.logger.info('Non-fully booked data! Use this to make it work better:');
        this.logger.info(data);
        // this API doesn't seem to offer detailed times, so just call it today
        // until we can get better data somewhere else
        const date = new Date().toISOString();
        return [{
          allDay: true,
          date: date,
          slots: parseInt(loc.totalAvailable) || null
        }];
      }else{
        this.logger.error(`no match in CVS data for city id "${this.params.locationName}"`);
        return [null];
      }
    });
  }
  
}

module.exports = CVS;