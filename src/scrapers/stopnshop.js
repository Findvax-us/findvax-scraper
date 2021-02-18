const config = require('../../config'),
      NightmareScraper = require('./nightmareScraperBase'),
      req = require('../simpleRequest'),
      formatter = require('../availabilityFormatter');

class StopNShop extends NightmareScraper{

  // hannaford uses the same system, but i did it for stop & shop first so they get the name

  // axios's default timeout is 1000ms, but our POSTs seem to get 
  // queued server-side by session so we need a muuuuch higher timeout
  static timeoutOverride = config.stopnshop.timeout;

  scrape(){
    const goButton = 'input#btnGo',
          daysToSearch = [];

    for(let i = config.stopnshop.daysToSearch; i >= 0; i--){
      let today = new Date(new Date().toDateString() + ' GMT' + this.tz),
          newDate = new Date(today.setDate(today.getDate() + i));
      daysToSearch.push(newDate);
    }

    // open a headless browser to let it do the redirect chain that sets
    // all the session cookies, then steal them for use in our POSTs

    // this whole thing is wrapped in format since this one follows a different pattern,
    // we make many requests and combine them into a single list
    return formatter.format(this.nightmare
      .goto(this.scrapeUrl)
      .wait(goButton)
      .cookies.get()
      .end()
      .then(cookies => {
        let promiseQ = [];
        daysToSearch.forEach(date => {
          let cookieString = cookies.reduce((acc, cookie) => acc + `${cookie.name}=${cookie.value}; `, '');
          let data = {
            facilityId: this.params.facilityId,
            year: date.getFullYear(),
            month: date.getMonth() + 1, //lmao it's zero indexed 
            day: date.getDate(),
            appointmentTypeId: this.params.appointmentTypeId
          },
          headers = {
            'X-Requested-With': 'XMLHttpRequest',
            'Cookie': cookieString.substring(0, cookieString.length - 1)
          };

          promiseQ.push(req.post(this.params.dayEndpoint, data, headers, StopNShop.timeoutOverride, this, response => {
            const day = JSON.parse(response);
            return this.parse(day.Data);
          }));
        });

        return Promise.all(promiseQ).then(results => {
          return results.flat(1);
        });
      })
      .catch(error => {
        this.logger.error(`Failed to load the page to steal cookies: ${error}`)
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