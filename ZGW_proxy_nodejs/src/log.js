// Rightly or wrongly, migrated from Winston for speed

const logLevels =
{
  error : 10,
  warn  : 20,
  info  : 30,
  debug : 40
}
const logConfig = require('config').get('logging');
const logLevel  = logLevels[logConfig.level]

module.exports = class log
{
  static error(message) { log.log('error', message) }
  static warn (message) { log.log('warn' , message) }
  static info (message) { log.log('info' , message) }
  static debug(message) { log.log('debug', message) }

  static log(level, message)
  {
    if(logLevel >= logLevels[level])
      console.log(level, ':', message);
  }
}
