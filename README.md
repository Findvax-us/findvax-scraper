# Jabzone Scraper

## Scraper tools for finding vaccine availability

Not yet meant for human consumption, but I think it's finally a solid base to build a bunch more scrapers.

This is MA focused right now because that's where I live and they gave me a helpful spreadsheet of locations but I'm avoiding state-specificity as much as possible (everything is respecting timezones, etc). I think the ideal would be one big scraper for each state generating a bunch of jsons organized by state? 

`testdata/` contains a bunch of MA locations in json format. `verified-locations.json` means I successfully tested them with scrapers and was able to get data (even if it was 0 availability). Items in `unverified-locations.json` are the opposite, typically because they haven't yet appeared in results yet. Hannaford/Stop & Shop locations in `unverified` are locations we know *exist* in the scheduler but haven't had open appointments yet so I haven't been able to get the correct `scraperParams.facilityId` for them.

`src/scrape.js` is the main entrypoint. It consumes some "locations" json and generates a bunch of json that's meant to be consumed by a frontend that doesn't exist yet. For now it just pretty prints it right to stdout for you to enjoy. 

Prefer making direct http requests over literal browser based html scraping, but uses [nightmare](https://github.com/segmentio/nightmare) for things that require a real browser instance as a relatively lightweight alternative to selenium or some other webdriver type thing.

### How to do the dang thing:

#### Setup

1. Install node please don't make me explain that just google it I am so tired
2. `npm i` 
3. `mkdir logs`
4. edit `config.js` for options on things like debug (extra info logged, probably too much) and log levels/locations

#### Run

1. at the top of `src/scrape.js` edit `const inFile = '../testdata/location-test.json';` to point one of the test locations jsons, or edit `location-test.json` to contain the specific locations you want to try scraping.
2. `./src/scrape.js`
3. results json will be printed to stdout

Logging is all bunyan, so you can do something like `tail -f logs/log.json | ./node_modules/.bin/bunyan` to get nicely formatted realtime logs.

### What am I looking at

`src/scrapers/` contains all the specific scraper type classes. Everything is a subclass of `Base` which sets up the loggers and whatnot, and currently two intermediate base classes exist: `NightmareScraper` (for browser instance based stuff) and `SimpleScraper` (if you can do it all with some GET/POSTs). A very simple html example is `amherst.js` which extends `SimpleScraper` to just GET the page and then `parse()` the html to figure out the slots. `athena.js` is an example of using the webapp's APIs directly: fetch the two required tokens, request the schedule json, reformat it for our purposes. `stopnshop.js` is ~~a mess~~ is a little of both, using nightmare to open a browser and establish a session, then using those session cookies to make API calls. 

### Metrics

Lambda billing is in Gigabyte-seconds (memory used x runtime) and has a max runtime of 15 mins, so it seems like a good idea to keep an eye on that. Right now just dumps memory usage/cpu time via bunyan logs, parseable with the same cli tool above. Might be worth using node's built in profiler stuff instead but I think this will satisfy the question of "is this gonna cost a billion dollars to run" which I am paranoid about.

### TODO

- **_More scraper classes_** lots of locations we can't read yet
- More locations, this was the result of just making my way down the alphabetical listing in the spreadsheet
- Have individual scrapers write their start/finish times to metrics (when enabled) 
- Better (literally any) doc
- Clean up `scrape.js` and organize writing results json 
- Add `production` config option to represent whether we're running on AWS in a lambda and should be reading/writing to S3 instead of local testdata files
- AWS deploy stuff
- Results json organization: 
  - one big availability.json for everything in the state? 
  - how do we handle missing results/no response for a specific location? write the previous run's results into the new json?
- ??? probably a lot more huh