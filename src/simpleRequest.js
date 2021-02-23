const config = require('./config');
const axios = require('axios'),
      util = require('util');

const responseLoggingSerializer = (res) => {
  if(!res){
    return res;
  }
  let logObj = {
    status: res.status || null,
    statusText: res.statusText || null,
    headers: res.headers || null
  }

  if(config.debug && res.data){
    logObj.data = res.data || null;
  }
  return logObj;
}

const errorLoggingSerializer = (error) => {
  if(!error){
    return error;
  }
  let logObj = {};
  if(error.response){
    // The request was made and the server responded with a status code
    // that falls out of the range of 2xx
    logObj.axiosError = 'Non 2xx response received';
    logObj.responseStatus = error.response.status;
    logObj.responseHeaders = error.response.headers;
    if(config.debug){
      logObj.responseData = error.response.data;
    }
  }else if(error.request){
    // The request was made but no response was received
    // `error.request` is an instance of http.ClientRequest
    logObj.axiosError = 'No response received';
    if(error.request.path && error.request.method){
      logObj.requestPath = `${error.request.method} ${error.request.path}`;
    }
    if(config.debug){
      logObj.requestObj = error.request;
    }
  }else{
    // Something happened in setting up the request that triggered an Error
    logObj.axiosError = 'Error in setting up request';
    logObj.error = error;
  }

  return logObj;
}

const defaultErrorHandler = (error, that) => {
  throw `Request failure: ${error}`;
}

const call = (method, url, data, headers, timeout, that, successHandler, errorHandler) => {

  that.logger.addSerializers({
    axiosResponse: responseLoggingSerializer,
    axiosError: errorLoggingSerializer
  })

  const defaultHeaders = {
          'Pragma': 'no-cache',
          'Cache-Control': 'no-cache'
        },
        mergedHeaders = Object.assign(defaultHeaders, headers);

  let reqconf = {
    url: url,
    method: method,
    data: data,
    headers: mergedHeaders,
    // ensure that the response is not automatically parsed at all
    // https://github.com/axios/axios/issues/2791
    transformResponse: [resData => resData], 
    responseType: 'text',
    timeout: config.http.timeout,
    maxRedirects: config.http.maxRedirects
  };

  if(timeout){
    reqconf.timeout = timeout;
  }

  if(!errorHandler){
    errorHandler = defaultErrorHandler;
  }

  that.logger.trace(`Request config: ${util.inspect(reqconf, false, null, true)}`);

  return axios(reqconf)
           .then(response => {
             that.logger.info(`${response.status} ${response.statusText}`);
             that.logger.trace({axiosResponse: response});
              try{
                return successHandler(response.data, that)
              }catch(handlerError){
                that.logger.error('Error in request successHandler');
                that.logger.error({err: handlerError});
                throw handlerError;
              }
           })
           .catch(err => {
              that.logger.error('Error making request');
              that.logger.error({axiosError: err});
              return errorHandler(err, that)
          });
}

module.exports.get = (url, headers, timeout, that, successHandler, errorHandler = undefined) => {

  that.logger.info(`GET ${url}`);

  return call(
    'get',
    url,
    null,
    headers,
    timeout,
    that,
    successHandler,
    errorHandler
  );
}

module.exports.post = (url, data, headers, timeout, that, successHandler, errorHandler = undefined) => {

  that.logger.info(`POST ${url}`);

  return call(
    'post',
    url,
    data,
    headers,
    timeout,
    that,
    successHandler,
    errorHandler
  );
}