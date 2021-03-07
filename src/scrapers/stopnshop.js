const config = require('../config'),
      SimpleScraper = require('./simpleScraperBase.js'),
      req = require('../simpleRequest'),
      formatter = require('../availabilityFormatter');

class StopNShop extends SimpleScraper{

  // hannaford uses the same system, but i did it for stop & shop first so they get the name

  // axios's default timeout is 1000ms, but our POSTs seem to get 
  // queued server-side by session so we need a muuuuch higher timeout
  static timeoutOverride = config.stopnshop.timeout;

  scrape(){
    const daysToSearch = [];

    for(let i = config.stopnshop.daysToSearch; i >= 0; i--){
      let today = new Date(new Date().toDateString() + ' GMT' + this.tz),
          newDate = new Date(today.setDate(today.getDate() + i));
      daysToSearch.push(newDate);
    }

  
    let promiseQ = [];
    daysToSearch.forEach(date => {
      let data = {
        facilityId: this.params.facilityId,
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        day: date.getDate(),
        appointmentTypeId: this.params.appointmentTypeId
      };

      // do the redirect chain to set cookies for each individual day POST request
      // so that each one gets a unique session id
      // otherwise the server queues them together by session and handles them sequentially, which is very slow
      promiseQ.push(req.getAndChaseRedirects(this.scrapeUrl, null, StopNShop.timeoutOverride, this, initResponse => {

        if(initResponse.config.url.includes('softblock')){
          // queue-it has sent us to captcha hell for being a bot
          this.logger.error(`We've been captcha'd`);
          throw 'Sent to captcha softblock hell';
        }
        let headers = initResponse.config.headers;
        headers['X-Requested-With'] = 'XMLHttpRequest';

        return req.post(this.params.dayEndpoint, data, headers, StopNShop.timeoutOverride, this, response => {
          const day = JSON.parse(response.data);
          return this.parse(day.Data);
        });
      })
      .catch(error => {
        this.logger.error(`Failed to load the page to steal cookies: ${error}`)
        throw error;
      }));
    });

    return formatter.format(Promise.all(promiseQ).then(results => {
      return results.flat(1);
    })
    .catch(error => {
      // propagate the error so it kills the entire queue for this instance
      throw error;
    }), this.uuid);
  }

  parse(resDay){

    const myDate = resDay.Date;

    if(resDay.Rows.length > 0){
      let times = [];

      resDay.Rows.forEach(row => {
        let dateObj = new Date(`${myDate} ${row.TimeSlotTime.Hours}:${row.TimeSlotTime.Minutes} GMT ${this.tz}`);

        times.push({
          allDay: false,
          date: dateObj.toISOString(),
          slots: 1
        });
      })

      return times;
    }else{
      this.logger.info(`No time slots available on ${resDay.Date}`);
      return [];
    }
  }
  
}

module.exports = StopNShop