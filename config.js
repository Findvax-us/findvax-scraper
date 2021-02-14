module.exports = {
  appName: "JabzoneScraper",
  debug: false,
  logging: {
    level: "info",
    stdout: false,
    file: "./logs/log.json"
  },
  metrics: {
    file: "./logs/metrics.json"
  },
  http: {
    timeout: 10000,
    maxRedirects: 5
  },
  stopnshop: {
    daysToSearch: 7,
    timeout: 30 * 1000
  },
  athena: {
    daysToSearch: 14
  }
};