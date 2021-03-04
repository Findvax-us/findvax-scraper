const SimpleScraper = require('./simpleScraperBase');

class Curative extends SimpleScraper{

  get scrapeUrl(){
    return this.url + this.params.curativeSiteId + '?';
  }

  parse(json, that){
    const data = JSON.parse(json);
          let results = [];

          // this top level flag controls whether any of these times are bookable
          // if they're not bookable, we don't want to show them as available
          if(data.visible_in_search){
            results = data.appointment_windows.map(appt => {
              if(appt.status == 'Active'){
                const startTime = new Date(appt.start_time),
                      slots = parseInt(appt.slots_available);

                if(slots > 0){
                  return {
                    allDay: false,
                    date: startTime.toISOString(),
                    slots: slots
                  }
                }else{
                  return null;
                }
              }
            });
          }else{
            that.logger.info('Found timeslots, but they are not open for booking.')
          }
    return results;
  }
}

module.exports = Curative;