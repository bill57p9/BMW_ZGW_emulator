// canSerial.js

const SerialPort = require('serialport');
const Readline = require('@serialport/parser-readline');
const { canMessage } = require('./enet');

var canMessageHandler = null;

exports.CANoverSerial = class CANoverSerial
{
  constructor(device, options)
  {
    this.port   = new SerialPort(device, options);
    this.parser = this.port.pipe(new Readline({ delimiter: '\n' }));
    this.parser.on('data', CANoverSerial.onRx);
  }
  static bindPort(dev, options) { return new CANoverSerial(dev, options); }
  send(canMessage)
  {
    // For compatibility with socketcan this needs to return 16 for OK
    const serialMessage = canMessage.toString().concat('\n');
    return this.port.write(serialMessage)+15;

  };
  static onRx(line)
  {
    // canMessage.fromString will discard irrelevant packets
    const canMsg = canMessage.fromString(line);
    if(canMsg && canMessageHandler)
      canMessageHandler(canMsg);
  }

  setRxFilters()  {};
  start()         {};
  addListener(event, func)
  {
    switch(event)
    {
      case 'onMessage':
        canMessageHandler = func;
    }
  }



}
