const config = require('../../config'),
      SimpleScraper = require('./simpleScraperBase'),
      req = require('../simpleRequest'),
      formatter = require('../availabilityFormatter');
const dayjs = require('dayjs'),
      customParseFormat = require('dayjs/plugin/customParseFormat'),
      utc = require('dayjs/plugin/utc');
dayjs.extend(customParseFormat);
dayjs.extend(utc);

class Athena extends SimpleScraper{

  static dateFormat = 'YYYY-MM-DD[T]HH:mm:ssZ';
  static bearerTokenEndpoint = "https://framework-backend.scheduling.athena.io/t";
  static jwtEndpoint = "https://framework-backend.scheduling.athena.io/u?locationId=${locationId}&practitionerId=&contextId=${contextId}";
  static graphqlEndpoint = "https://framework-backend.scheduling.athena.io/v1/graphql";


  scrape(){
    const now = dayjs.utc().utcOffset(parseInt(this.tz)),
          rangeEnd = dayjs(now).add(config.athena.daysToSearch, 'day'),
          startString = now.format(Athena.dateFormat),
          endString = rangeEnd.format(Athena.dateFormat);

    const requestBody = `{"operationName":"SearchSlots","variables":{"locationIds":["${this.params.locationId}"],"practitionerIds":[],"serviceTypeTokens":["codesystem.scheduling.athena.io/servicetype.canonical|49b8e757-0345-4923-9889-a3b57f05aed2"],"specialty":"Unknown Provider","startAfter":"${startString}","startBefore":"${endString}"},"query":"query SearchSlots( $locationIds: [String!],  $practitionerIds: [String!],  $specialty: String,  $serviceTypeTokens: [String!]!,  $startAfter: String!,  $startBefore: String!,  $visitType: VisitType) {   searchSlots( locationIds: $locationIds,    practitionerIds: $practitionerIds,    specialty: $specialty,    serviceTypeTokens: $serviceTypeTokens,    startAfter: $startAfter,    startBefore: $startBefore,    visitType: $visitType) {     practitionerAvailability {     availability {      id      start      end      status     }    }   } }"}`;

    const jwtEndpointResolved = Athena.jwtEndpoint
                                  .replace("${locationId}", this.params.locationId)
                                  .replace("${contextId}", this.params.contextId);

    let tokens = {};

    return Promise.all([
      req.get(Athena.bearerTokenEndpoint, null, null, this, response => tokens.auth = JSON.parse(response).token),
      req.get(jwtEndpointResolved, null, null, this, response => tokens.jwt = JSON.parse(response).token)
    ]).then(() => {
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokens.auth}`,
        'x-scheduling-jwt': tokens.jwt
      };

      this.logger.trace("Successfully fetched tokens, making POST for schedule");
      return formatter.format(
        req.post(Athena.graphqlEndpoint, requestBody, headers, null, this, this.parse), 
        this.uuid
      );
    })
    .catch((err) => {
      this.logger.error({err: err});
      return;
    })
  }

  parse(jsonString, that){
    const obj = JSON.parse(jsonString),
          slots = obj.data.searchSlots;

    if(slots.length > 0 && slots[0].practitionerAvailability.length > 0){
      const availables = slots[0].practitionerAvailability[0].availability;

      return availables.map(slot => {
        if(slot.status == 'free'){
          let dateObj = dayjs(slot.start, Athena.dateFormat);

          return {
            allDay: false,
            date: dateObj.toISOString(),
            slots: null
          }
        }
      });
    }else{
      this.logger.info("No schedule search slots found");
      return;
    }
  }
  
}

module.exports = Athena