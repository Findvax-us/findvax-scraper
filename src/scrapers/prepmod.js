const SimpleScraper = require('./simpleScraperBase');
const cheerio = require('cheerio');

class Prepmod extends SimpleScraper{

  parse(html, that){
    const anchorLocator = 'a.button-primary:contains("Sign Up for a COVID-19 Vaccination")';
    const $ = cheerio.load(html);

    let arr = $(anchorLocator).map(function(i, el){
      const container = $(this).parent().parent(),
            title = container.find('p.text-xl').text(),
            strongTag = container.find('p > strong:contains("Available Appointments")'),
            apptContainer = strongTag.parent(),
            titleChunks = title.split(`${that.params.titleName} on `),
            dateObj = new Date(titleChunks[titleChunks.length - 1].trim() + 'GMT' + that.tz);

      strongTag.replaceWith('');

      const slotCount = parseInt(apptContainer.text());

      if(slotCount > 0){
        return {
          allDay: true,
          date: dateObj.toISOString(),
          slots: slotCount
        }
      }else{
        return;
      }
    }).toArray();

    that.logger.trace(`Found ${arr.length} availability items`);

    return arr;
  }
  
}

module.exports = Prepmod;