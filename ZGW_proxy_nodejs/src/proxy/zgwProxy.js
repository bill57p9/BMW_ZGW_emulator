
const { tcpServer, tcpClient }  = require('./tcpServer');
const { canMessage, enetMessage}= require('./enet.js');
const log    = require('../log');
const config = require('config');

const canId  = config.get('ecuId');

class zgwReal extends tcpClient
{
  onRx(data)
  {
    log.debug(data);
  }
}

const car   = new zgwReal(config.get('car.icom'));
const proxy = new tcpServer(config.get('proxy.icom'));

car.postConnect = () =>
{
  // Request VIN
  const message = enetMessage.fromCAN(canMessage.fromString('6F4#100322F190\n')).enet.data;
  log.debug(`pxy>zgw ${message.toString('hex')}`);
  car.socket.write(message);
}
car.vin = null;
//const can   = require('socketcan').createRawChannel("can0");
//can.start();
const serial= config.get('serialCANproxy');
const can   = require('./CANoverSerial').CANoverSerial.bindPort(serial.port, serial.portOpt);


var  enetMsg = null;

var canBuf= [];

proxy.canMsg = Buffer.alloc(0);


proxy.send = (data) =>
{
  proxy.connections.forEach((connection) =>
  {
    log.debug(`   >pc  ${data.toString('hex')}`);

	  if(connection.writable)
		connection.write(data);
  });
}

//car.onRx = proxy.send;
car.vinMessage = Buffer.from('00000016000110f462f190','hex');
car.onRx = (message) =>
{
  // Intercept VIN
  if(message.length > car.vinMessage.length)
  {
    if(0 == car.vinMessage.compare(message, 0, car.vinMessage.length))
    {
      car.vin = message.toString('ascii',11);
      log.info(`VIN ${car.vin}`);
    }
  }

  return proxy.send(message);
}

// When we receive an Enet datagram from diags
proxy.onRx = (data) =>
{
  if(!enetMsg)
  {
    enetMsg = enetMessage.new({ payloadLength : new enetMessage(data).payloadLength });
    enetMsg.enetLength = enetMsg.payloadLength + 8;
    enetMsg.rxBytes = 0;
  }

  // Copy data into enetMsg
  data.copy(enetMsg.data, enetMsg.rxBytes);
  enetMsg.rxBytes += data.length;

  // Do we have complete message?
  const xsBytes = enetMsg.rxBytes - enetMsg.enetLength;
  if(xsBytes > -1)
  {
    log.debug(`pc >zgw ${enetMsg.data.toString('hex')}`);
    car.socket.write(enetMsg.data);

    // Forward ICAM messages over CANBUS
    if(canId.ecu == enetMsg.dstEcu)
      {
        canBuf[enetMsg.dstEcu] = enetMsg.canPackets();
        can.tx(canBuf[enetMsg.dstEcu].shift());
      }
    enetMsg = null;

    // Handle the start of another message on the end
    if(xsBytes > 0)
      proxy.onRx(data.subarray(data.length - xsBytes));
  }
}

can.onMessage = (canPacket) =>
{
  const srcEcu = canPacket.id & 0x0FF;
  log.debug(`can>    ${canPacket.id.toString(16)}#${canPacket.data.toString('hex')}`);
	// is for us?
	if(canId.enet == canPacket.data[0] && canId.ecu == srcEcu)
  {
    var result = enetMessage.fromCAN(canPacket, can);
    if(result.can)
    {
      if(true === result.can)
      {
        canBuf[srcEcu].forEach((canPacket) => { can.tx(canPacket); });
        // Clear buffer
        canBuf[srcEcu] = {};
      }
      else
      {
        log.debug(`pxy>can ${result.can.id.toString(16)}#${result.can.data.toString('hex')}`);
        can.send(result.can);
      }
    }
    if(result.enet)
      proxy.send(result.enet.data);
  }

}

can.tx = (canFrame) =>
{
  var result = 0;
  while(16 != result)
  {
    result = can.send(canFrame);
    log.debug(`pc*>can [${result}] ${canFrame.toString('hex')}`);
  }
}

can.setRxFilters
({
	id : 0x600 | canId.ecu,
	mask: 0xFFF
});
can.addListener("onMessage", can.onMessage);
can.start();

exports.car = car;
