const config = require('../config'),
      SimpleScraper = require('./simpleScraperBase'),
      req = require('../simpleRequest'),
      formatter = require('../availabilityFormatter');
const cheerio = require('cheerio');dayjs = require('dayjs'),
      customParseFormat = require('dayjs/plugin/customParseFormat');
dayjs.extend(customParseFormat);

class TimeTap extends SimpleScraper{

  static dayAvailabilityEndpoint = '/businessWeb/csapi/cs/availability/day/'; // + YYYY/m/d
  static dateFormat = 'YYYY-MM-DD HHmm Z';

  scrape(){

    return req.get(this.scrapeUrl, null, null, this, response => response)
       .then(html => {
         const $ = cheerio.load(html),
               tokenStringFinder = 'sessionStorage.setItem("token", "';
         let token;

         $('head > script').each(function(i, elem){
           const tagString = $(this).html();

           if(tagString.includes(tokenStringFinder)){
             token = tagString.substring(tagString.indexOf(tokenStringFinder) + tokenStringFinder.length).split('\"')[0];
           }
         });

         if(!token){
           throw 'No auth token found!';
         }

         const urlBase = `${this.scrapeUrl}${TimeTap.dayAvailabilityEndpoint}`,
               headers = {
                'Content-Type': 'application/json', 
                 Authorization: `Bearer ${token}`
               };

         let promiseQ = [];

         for(let i = config.timetap.daysToSearch; i >= 0; i--){

           let today = new Date(new Date().toDateString() + ' GMT' + this.tz),
               newDate = new Date(today.setDate(today.getDate() + i)),
               year = newDate.getFullYear(),
               month = newDate.getMonth() + 1,
               day = newDate.getDate();
           
           const url = `${urlBase}${year}/${month}/${day}`,
                 body = `{"auditReferralId":null,"debug":false,"locale":"en-us","businessId":${this.params.businessId},"schedulerLinkId":${this.params.schedulerLinkId},"staffIdList":null,"reasonIdList":[595361],"locationIdList":null,"locationGroupIdList":null,"reasonGroupIdList":null,"locationSuperGroupIdList":null,"reasonSuperGroupIdList":null,"classScheduleIdList":null,"groupIdList":null,"clientTimeZone":"${this.params.businessTimeZone}","businessTimeZone":"${this.params.businessTimeZone}"}`;

           promiseQ.push(
             req.post(url, body, headers, null, this, this.parse)
           );
         }

         return formatter.format(Promise.all(promiseQ).then(results => {
           return results.flat(1);
         }), this.uuid);

       })
       .catch(error => {
         this.logger.error({err: error});
         return;
       })

  }

  parse(json, that){
    const data = JSON.parse(json);

    if(data.timeSlots.length > 0){

      return data.timeSlots.map(slot => {
        let dateObj = dayjs(`${slot.clientStartDate} ${slot.clientStartTime} ${that.tz}`, TimeTap.dateFormat);

        return {
          allDay: false,
          date: dateObj.toISOString(),
          slots: null
        }
      });

    }else{
      that.logger.info(`No time slots available on ${data.date}`);
      return [];
    }
  }
  
}

module.exports = TimeTap;