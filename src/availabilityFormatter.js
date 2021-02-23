const config = require('./config');

// do it in one place so we don't have to fix it in a million when it inevitably needs changing

module.exports.format = (arrayPromise, uuid) => {
  return arrayPromise.then(arr => {
    const now = new Date(),
          times = arr.filter(item => item !== undefined && item !== null);

    return {
      location: uuid,
      fetched: now.toISOString(),
      times: times
    }
  })
}