#!/usr/bin/env node

const config = require('../config');
const bunyan = require('bunyan');

// local testdata blah blah

const util = require('util'),
      fs = require('fs');

const inFile = 'testdata/verified-locations.json';

let locations;

try{
  locations = JSON.parse(fs.readFileSync(inFile, 'utf8'));
}catch(err){
  console.error(`Couldn't load locations json: ${err}`);
  process.exitCode = 1;
  process.exit();
}



// TODO: load from s3 for prod



// create the default shared logger 

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

const logger = bunyan.createLogger(logConfig);

// create the metrics logger and start it running (if enabled)

let metricsLoggerInterval;
if(config.metrics){
  let metricsLogConfig = {
    name: config.appName + "-metrics",
    streams: [{
      path: config.metrics.file,
      level: 'trace'
    }]
  };

  const metricsLogger = bunyan.createLogger(metricsLogConfig);

  metricsLoggerInterval = setInterval(() => {
    const memory = process.memoryUsage(),
          cpu = process.cpuUsage(),
          memoryDetails = {}
          cpuDetails = {};

    for(let k in memory){
      memoryDetails[k] = `${Math.round(memory[k] / 1024 / 1024 * 100) / 100} MB`
    }
    for(let k in cpu){
      cpuDetails[k] = `${Math.round(cpu[k] / 10000) / 1000} s`
    }

    metricsLogger.trace(memoryDetails);
    metricsLogger.trace(cpuDetails);
  }, 1000);
}


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

Promise.all(q).then(results => {
  console.log(util.inspect(results, false, null, true));
  clearInterval(metricsLoggerInterval);
});
