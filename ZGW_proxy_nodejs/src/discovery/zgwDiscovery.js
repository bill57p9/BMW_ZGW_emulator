
const server = require('dgram').createSocket('udp4');
const log    = require('../log');
const {car}  = require('../proxy/zgwProxy');

const proxy  = require('config').get('proxy.discover');

server.on('error', (err) => {
  log.error(`Discovery server error:\n${err.stack}`);
  server.close();
});

server.on('message', (msg, rinfo) =>
{
  // Message should be 6 bytes long, with first 4 bytes all zero

  if(car.vin) // We need the VIN for a meaningful response
  {
      //var response = Buffer.from('......DIAGADR10BMWMAC0000000000BMWVINWBA2E520405C95661');
      var response = Buffer.from('......DIAGADR10BMWMAC000000000000BMWVIN.................');

      // Copy ID
      response.writeUInt16BE(msg.readUInt16BE(4),4);

      // Set Length
      response.writeUInt32BE(response.length, 0);

      // Set VIN
      const vin = Buffer.from(car.vin, 'ascii');
      vin.copy(response, 39);

      log.debug(`Discovery from ${rinfo.address}:${rinfo.port} ${msg.toString('hex')} => ${response.toString('hex')}`);
      server.send(response, rinfo.port, rinfo.address);
  }
  else
    log.debug('Discovery ignored due no VIN');
});

server.on('listening', () => {
  const address = server.address();
  log.info(`Discovery server listening on ${address.address}:${address.port}`);
});

server.bind(proxy.port);
