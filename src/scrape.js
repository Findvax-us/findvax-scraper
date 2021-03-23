const config = require('./config');
const bunyan = require('bunyan'),
      dayjs = require('dayjs');

// used for local file mode only
const inLocationFile = '../data/MA/locations.json';
const inAvailabilityFile = 'testdata/availability-demo.json';
const outFile = 'testdata/availability.json';

// see initMetricsLogger
let metricsLoggerInterval;


// create and return the default shared logger object
const createLogger = () => {

  let logConfig = {
    name: config.appName,
    streams: [],
    serializers: {err: bunyan.stdSerializers.err}
  };
  if(config.logging.stdout){
    logConfig.streams.push({
      stream: process.stdout,
      level: config.logging.level
    });
  }
  if(config.logging.file){
    logConfig.streams.push({
      path: config.logging.file,
      level: config.logging.level
    });
  }
  if(config.debug){
    logConfig.src = true;
  }

  return bunyan.createLogger(logConfig);
}

// create the metrics logger and start it running (if enabled)
// sets global metricsLoggerInterval so it can be canceled elsewhere
const initMetricsLogger = () => {

  if(config.metrics){
    let metricsLogConfig = {
      name: config.appName + "-metrics",
      streams: []
    };

    if(config.metrics.stdout){
      metricsLogConfig.streams.push({
        stream: process.stdout,
        level: 'trace'
      });
    }

    if(config.metrics.file){
      metricsLogConfig.streams.push({
        stream: config.metrics.file,
        level: 'trace'
      });
    }

    const metricsLogger = bunyan.createLogger(metricsLogConfig);
    const logMetrics = () => {
      const memory = process.memoryUsage(),
            cpu = process.cpuUsage(),
            memoryDetails = {},
            cpuDetails = {};

      for(let k in memory){
        memoryDetails[k] = `${Math.round(memory[k] / 1024 / 1024 * 100) / 100} MB`
      }
      for(let k in cpu){
        cpuDetails[k] = `${Math.round(cpu[k] / 10000) / 1000} s`
      }

      metricsLogger.trace(memoryDetails);
      metricsLogger.trace(cpuDetails);
    }

    logMetrics(); // get one before we start for a baseline
    metricsLoggerInterval = setInterval(logMetrics, 1000);
  }
}

// load locations from the local filesystem
//   for local testing, not use on prod lambda
const loadLocalFileData = (path) => {
  const util = require('util'),
        fs = require('fs');
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

// load locations from S3
// returns a Promise of json, unlike local file sync
//   for use on prod lambda only
const loadS3Data = (state) => {
  const AWS = require('aws-sdk'),
        s3 = new AWS.S3({apiVersion: '2006-03-01'});

  const locationsParams = {
    Bucket: 'findvax-data',
    Key: `${state}/locations.json`
  },
  availabilityParams = {
    Bucket: 'findvax-data',
    Key: `${state}/availability.json`
  };

  let responses = {
    locations: null,
    availability: null
  };

  responses.locations = s3.getObject(locationsParams).promise()
                          .catch(err => {
                            console.error('Unable to load locations', err);
                            throw err;
                          });

  responses.availability = s3.getObject(availabilityParams).promise()
                             .catch(err => console.error('Unable to load previous availability, leaving null.', err));

  return responses;
}

const loadS3States = () => {
  const AWS = require('aws-sdk'),
        s3 = new AWS.S3({apiVersion: '2006-03-01'});

  const params = {
    Bucket: 'findvax-data',
    Key: 'states.json'
  };

  return s3.getObject(params)
    .promise()
    .catch(err => {
      console.error('Unable to load states definition', err);
      throw err;
    });
}

// kick off the scraper queue for a given set of locations
//    returns a Promise for completion of all scrapers
const scrape = (locations, prevAvailability) => {
  initMetricsLogger();
  const logger = createLogger();

  let q = [];

  locations.forEach(location => {
    logger.info(`Loading scraper for ${location.name} (${location.scraperClass})`);
    let clazz = require(`./scrapers/${location.scraperClass}`),
        scraper = new clazz(
          logger,
          location.scraperUrl, 
          location.uuid, 
          location.tz,
          location.scraperParams,
          location.name
        );
    q.push(scraper.scrape().catch(err => {
      // this scraper failed, so try to fill it in with previous data
      logger.error('Scraper failed', err);
      if(prevAvailability){
        let oldAvail = prevAvailability.find(avail => avail && avail.location && avail.location === location.uuid) || [];
        logger.error('Attempting to fill in with old data', oldAvail);

        return oldAvail;
      }else{
        logger.error('No previous data available, leaving empty');
      }
    }));
  });  

  return Promise.all(q);
}


// 
// -------- Entrypoints --------
//


// do the scraping using local files in and out
//    for local testing, not on prod lambda
const runLocalFileBasedScrape = () => {
  let locations;
  try{
    locations = loadLocalFileData(inLocationFile);
  }catch(err){
    console.error("Couldn't load locations json", err);
    process.exitCode = 1;
    process.exit();
  }

  let prevAvailability = null;
  try{
    prevAvailability = loadLocalFileData(inAvailabilityFile);
  }catch(err){
    console.error("Couldn't load old availability json", err);
  }

  scrape(locations, prevAvailability).then(results => {
    console.log(util.inspect(results, false, null, true));

    // assuming the imports were already done by the load data function
    try{
      fs.writeFileSync(outFile, JSON.stringify(results), 'utf8');
    }catch(err){
      console.error(`Couldn't write output json: ${err}`);
      process.exitCode = 1;
      process.exit();
    }

    clearInterval(metricsLoggerInterval);
  });
}

// do the scraping using S3 in and out
//    for prod lambda
const runS3BasedScrape = (state) => {
  console.log(`Starting scrape for ${state}`);
  const s3Promises = loadS3Data(state);

  return s3Promises.locations.then(data => {
    const locations = JSON.parse(data.Body.toString('utf-8'));

    return s3Promises.availability.then(data => {
      let prevAvailability = null;
      try{
        prevAvailability = JSON.parse(data.Body.toString('utf-8'));
      }catch(err){
        console.error("Couldn't load previous availability json", err);
      }

      return scrape(locations, prevAvailability).then(results => {

        let expiration = dayjs(new Date()).add(5, 'minute').toISOString();

        const params = {
          Bucket: 'findvax-data',
          Key: `${state}/availability.json`,
          Body: JSON.stringify(results),
          CacheControl: `public; max-age=${config.s3UploadMaxAge}; must-revalidate`,
          Expires: expiration
        };

        // write to s3
        try{
          const AWS = require('aws-sdk'),
                s3 = new AWS.S3({apiVersion: '2006-03-01'});
        
          return s3.upload(params).promise().then(data => {
            console.log(`Successful S3 upload for ${state}: `, data);
          }).catch(err => { throw err; });
          
        }catch(err){
          console.error(`Couldn't write ${state} output json to S3: ${err}`);
          throw err;
        }

        clearInterval(metricsLoggerInterval);
      }).catch((err) => {
        console.error(`Couldn't scrape ${state}: ${err}`);
        throw err;  
      });
    });
  }).catch(err => {
    console.error(`Couldn't load ${state} locations json`, err);
    process.exitCode = 1;
    process.exit();
  });
}

// hook for lambda
exports.handler = (event, context, callback) => {
  // ensure that we exit as soon as we call the callback no matter what
  context.callbackWaitsForEmptyEventLoop = false;

  if(event.init){
    // we're here to kick things off
    loadS3States().then(data => {
      const states = JSON.parse(data.Body.toString('utf-8'));
      const lambda = new AWS.Lambda({
        region: 'us-east-1'
      });

      states.map(state => {
        if(state.enabled){
          const params = {
            FunctionName: 'scraper',
            InvocationType: 'Event',
            Payload: {state: state.short},
            LogType: 'Tail',
          }

          lambda.invoke(params).promise(); // kick it off and immediately stop caring!
        }
      });

      callback(null, {
        statusCode: 200,
        state: 'none'
      });
    });

  }else if(event.state){

    runS3BasedScrape(event.state)
      .then(() => {
        console.log(`Scrape for ${event.state} completed successfully`);
        
        callback(null, {
          statusCode: 200,
          state: event.state
        });
      })
      .catch((err) => {
        console.error(`${event.state} Scrape error : ${err}`);

        callback(err, {
          statusCode: 500,
        });
      });
  }else{
    // we were not triggered properly, time to die
    callback('Missing either init or state trigger', {
      statusCode: 500,
    });
  }
}

// hook for local cli
exports.runLocal = () => {
  runLocalFileBasedScrape();
}