const config = require('./config');
const bunyan = require('bunyan'),
      dayjs = require('dayjs');

// used for local file mode only
const inFile = 'testdata/location-test.json';
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
const loadLocalFileData = () => {
  const util = require('util'),
        fs = require('fs');

  try{
    return JSON.parse(fs.readFileSync(inFile, 'utf8'));
  }catch(err){
    console.error(`Couldn't load locations json: ${err}`);
    process.exitCode = 1;
    process.exit();
  }
}

// load locations from S3
// returns a Promise of json, unlike local file sync
//   for use on prod lambda only
const loadS3Data = () => {
  const AWS = require('aws-sdk'),
        s3 = new AWS.S3({apiVersion: '2006-03-01'});

  const params = {
    Bucket: 'findvax-data',
    Key: 'MA/locations.json' // TODO: states lol
  };

  return s3.getObject(params).promise();
}

// kick off the scraper queue for a given set of locations
//    returns a Promise for completion of all scrapers
const scrape = (locations) => {
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
    q.push(scraper.scrape());
  });  

  return Promise.all(q);
}


// 
// -------- Entrypoints --------
//


// do the scraping using local files in and out
//    for local testing, not on prod lambda
const runLocalFileBasedScrape = () => {
  const locations = loadLocalFileData();

  scrape(locations).then(results => {
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
const runS3BasedScrape = () => {
  return loadS3Data().then(data => {

    const locations = JSON.parse(data.Body.toString('utf-8'));

    return scrape(locations).then(results => {

      let expiration = dayjs(new Date()).add(5, 'minute').toISOString();

      const params = {
        Bucket: 'findvax-data',
        Key: 'MA/availability.json', // TODO: states lol
        Body: JSON.stringify(results),
        CacheControl: 'public; max-age=300; must-revalidate',
        Expires: expiration
      };

      // write to s3
      try{
        const AWS = require('aws-sdk'),
              s3 = new AWS.S3({apiVersion: '2006-03-01'});
      
        return s3.upload(params).promise().then(data => {
          console.log('Successful S3 upload: ', data);
        }).catch(err => { throw err; });
        
      }catch(err){
        console.error(`Couldn't write output json to S3: ${err}`);
        throw err;
      }

      clearInterval(metricsLoggerInterval);
    }).catch((err) => {
      console.error(`Couldn't scrape: ${err}`);
      throw err;  
    });
  })
  .catch(err => {
    console.error(`Couldn't load locations from S3: ${err}`);
    throw err;
  });
}

// hook for lambda
exports.handler = (event, context, callback) => {
  // ensure that we exit as soon as we call the callback no matter what
  context.callbackWaitsForEmptyEventLoop = false;

  runS3BasedScrape()
    .then(() => {
      console.log('Scrape completed successfully');
      
      callback(null, {
        statusCode: 200,
      });
    })
    .catch((err) => {
      console.error(`Scrape error: ${err}`);

      callback(err, {
        statusCode: 500,
      });
    })
}

// hook for local cli
exports.runLocal = () => {
  runLocalFileBasedScrape();
}