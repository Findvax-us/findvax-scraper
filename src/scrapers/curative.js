const SimpleScraper = require('./simpleScraperBase');

class Curative extends SimpleScraper{

  get scrapeUrl(){
    return this.url + this.params.curativeSiteId + '?';
  }

  parse(json, that){
    const data = JSON.parse(json),
          results = data.appointment_windows.map(appt => {
            if(appt.status == 'Active'){
              const startTime = new Date(appt.start_time),
                    slots = parseInt(appt.slots_available);

              return {
                allDay: false,
                date: startTime.toISOString(),
                slots: slots
              }
            }
          });
    return results;
  }
}

module.exports = Curative;