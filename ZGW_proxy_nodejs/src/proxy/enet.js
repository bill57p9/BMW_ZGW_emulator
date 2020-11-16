
const log    = require('../log')

_canMessageBuffer = [];

const canMessage = class canMessage
{
  constructor(id, data)
  {
    this.id   = id;
    this.data = data;
  }

  // Generate a string in the format NNN#DDDD..
  toString()
  {
    var result = this.id.toString(16); // CAN ID
    while(result.length < 3) { result = "0" + result }; // leading 0s

    return result.concat('#',this.data.toString('HEX')).toUpperCase();
  }

  // Parse a string in the format NNN#DDDD
  static fromString(string)
  {
    const func = (string) =>
    {
      // Make sure string is credible
      // Due to trailing \n, length must be > 6, <22 and odd
      if(    string.length < 7
        ||   string.length > 21
        || !(string.length & 1)) return null;
      // Fourth chartacter must be #
      if('#' != string.charAt(3))   return null;

      return new canMessage
      (
        parseInt(string.substr(0,3), 16),
        Buffer.from(string.substr(4), 'HEX')
      );
    }

    var result = func(string);
    if(!result)
      log.debug(`CAN fromString discarded (${string.length}): ${string}`);
    return result;
  }
}

exports.canMessage  = canMessage;

exports.enetMessage = class enetMessage
{
  constructor(buffer)
  {
    this.data = Buffer.from(buffer);

    // Bytes 2 & 3 are length (payload Length + 2)
    // Sanity check: bytes that I don't understand(!)
    if(this.data[0] | this.data[1] | this.data[4])
      log.error(`Unrecognised message!! ${this.data.toString('hex')}`);
  }

  // Packet receiver
  static rxPacket(packet)
  {
    var messages = [];
    var enetByte = 0;

    while(enetByte < packet.length)
    {
      // The length in the message data excludes a couple of header items
      var messageLength = packet[enetByte+3]+6;

      var message = Buffer.assign(messageLength);
      var copied  = packet.copy(message, enetByte);
      enetByte   += messages.push(new enetMessage(message));
    }
    return messages;
  }

  // Receive a CAN packet and return
  static fromCAN(canMsg)
  {
    const srcEcu = canMsg.id;
    const dstEcu = canMsg.data[0];
    var serial   = canMsg.data[1] & 0x0F;
    var response = {};
    var intOffset= 1; // How many bytes shorter first message is

    switch(canMsg.data[1] & 0xF0)
    {
      case 0x00:    // Single packet message. "serial" is length
        _canMessageBuffer[srcEcu] = enetMessage.new
        ({
          srcEcu    : srcEcu,
          dstEcu    : dstEcu,
          payloadLength : serial
        });
        _canMessageBuffer[srcEcu].serial = 0;
        canMsg.data.copy(_canMessageBuffer[srcEcu].data, 8, 2, 8);
        serial = 0;
        intOffset = 0;
        break;


      case 0x10:    // Initial message
        if(_canMessageBuffer[srcEcu])
          if(_canMessageBuffer[srcEcu].serial > 0)
            log.warn('Initial packet rxd when continuation expected! %d %s (%d)', canMsg.id, canMsg.data.toString('hex'), _canMessageBuffer[srcEcu].serial);
        _canMessageBuffer[srcEcu] = enetMessage.new
        ({
          srcEcu    : srcEcu,
          dstEcu    : dstEcu,
          payloadLength : canMsg.data.readUInt16BE(1) & 0x0FFF
        })
        _canMessageBuffer[srcEcu].serial = 0;
        canMsg.data.copy(_canMessageBuffer[srcEcu].data, 8, 3, 8);

        // Need to send ACK if message incomplete
        if( _canMessageBuffer[srcEcu].payloadLength>5)
        {
          response.can=new canMessage(dstEcu | 0x600, Buffer.from([ srcEcu, 0x30, 0x00, 0x02 ]));
/*          {
            id: dstEcu | 0x600,
            data: Buffer.from([ srcEcu, 0x30, 0x00, 0x02 ])
          };*/
        }
        break;

      case 0x20:    // Continuation
        if(_canMessageBuffer[srcEcu].dstEcu != dstEcu)
        {
          log.warn('Expecting ECU %d but received %d!', _canMessageBuffer[srcEcu].dstEcu, dstEcu);
          return false;
        }
        canMsg.data.copy(_canMessageBuffer[srcEcu].data, 7+(6*_canMessageBuffer[srcEcu].serial), 2, 8);

        // Check message order
        if(serial != (_canMessageBuffer[srcEcu].serial & 0x0F))
        {
          log.warn('Expecting serial %d but received %d!', _canMessageBuffer[srcEcu].serial & 0x0F, serial);
          return false;
        }

        break;

      case 0x30:    // Ready for continuation is 30 00
        if(!_canMessageBuffer[srcEcu])
          _canMessageBuffer[srcEcu] = { serial : 0};
        if(0x00 == canMsg.data[2] /*&& 0x02 == canMsg.data[3]*/ )
        {
          response.can = true;
          break;
        }
        // else Unrecognised - fall through
      default:
        log.warn('Unexpected CAN message: %d %s!', canMsg.id, canMsg.data.toString('hex'));
        return false;
    }

    // Check whether we have a complete message
    ++_canMessageBuffer[srcEcu].serial;
    if(_canMessageBuffer[srcEcu].payloadLength <= (_canMessageBuffer[srcEcu].serial * 6) -intOffset)
    {
      // We have a complete message -> Respond
      _canMessageBuffer[srcEcu].serial = 0;
      response.enet = _canMessageBuffer[srcEcu];
    }

    return response;
  }

  // Create new message
  static new(params={})
  {
    var buffer = Buffer.alloc(params.payloadLength+8, 0);
    buffer.writeUInt16BE(buffer.length - 6, 2);
    buffer[5]  = params.messageType ? params.messageType : 1;
    if(params.srcEcu)   buffer[6]  = params.srcEcu;
    if(params.dstEcu)   buffer[7]  = params.dstEcu;

    return new enetMessage(buffer);
  }
  // Offsets within the message
  static offset()
  {
    var result =
    {
      length  : 3,
      msgType : 5,
      srcEcu  : 6,
      dstEcu  : 7
    };
    return result;
  }

  //get payloadLength() { return 0x100*this.data[2]+this.data[3]-2 }
  //get messageLength() { return 0x100*this.data[2]+this.data[3]+6 }
  get payloadLength() { return this.data.readUInt16BE(2)-2; }
  get messageLength() { return this.data.readUInt16BE(2)+6; }
  get isFullMessage() { return (this.messageLength == this.data.length) }

  // Return the ECU IDs
  get srcEcu()        { return this.data[6]; }
  get dstEcu()        { return this.data[7]; }

  // Set ECU IDs
  set srcEcu(id)      { this.data[6] = id;   }
  set dstEcu(id)      { this.data[7] = id;   }

  // Return array of equivalent CAN messages
  canPackets(forceMultipart=false)
  {
    var packets = [];
    var serial  = 0;  // Packet serial number
    const payloadLength = this.data.length - 8;

    // CAN payloadLength is 1 byte
    if(0xFFF < payloadLength)
      log.warn('!! Non-credible payload length: %d %s', payloadLength, this.data.toString('hex'));

    for(var enetByte=8; enetByte<this.data.length; ++serial)
    {
      // CAN packet can be up to 8 bytes in Length
      // INCLUDING header (which is 2 bytes)
      var packetLength = this.data.length - enetByte + 2;

      // First packet has length data as a byte too
      // Special case: Short message without forceMultipart
      if(!serial && (payloadLength>6 || forceMultipart))
        ++packetLength;
      if(packetLength > 8)
        packetLength = 8;

      // Create variable to hold the packet data
      var data = Buffer.alloc(packetLength, 0x43);

      // First message, the header has a length field
      if(!serial)
      {

        if(payloadLength>6 || forceMultipart)
        {
          data.writeUInt16BE(payloadLength | 0x1000, 1);
          enetByte += this.data.copy(data, 3, enetByte, enetByte+5);
        }
        else
        {
          data[1]   = payloadLength;
          enetByte += this.data.copy(data, 2, enetByte, enetByte+6);
        }
      }
      else
      {
        data[1]   = 0x20 | (serial & 0x0F);
        enetByte += this.data.copy(data, 2, enetByte, enetByte+6);
      }

      data[0]  = this.dstEcu;     // First byte is destination ECU ID

      packets.push(new canMessage(0x600 + this.srcEcu, data));
/*      ({
        id   : 0x600 + this.srcEcu,
        data : data
      }); */
    }
    return packets;
  }

}
