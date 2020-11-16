
const net = require('net');
const log    = require('../log');

class tcpClientServer
{
  onConnectionEvent(connection)
  {
    // Set up events
    connection.on('data' , this.onRx);
    connection.on('close', this.onClose);
    connection.on('error', this.onError);

    this.postConnect(connection);
  }

  postConnect() {};
  onRx()    {}
  onClose(data)
  {
    log.info('Client disconnected ', data);
  }
  onError(error)
  {
    log.error('Error: ', error);
  }
}

exports.tcpServer = class tcpServer extends tcpClientServer
{
  constructor(options)
  {
    super();
    this.socket = net.createServer();
    this.socket.parent = this;
    this.connections = [];
    this.socket.on('connection', this.onConnection);
    this.socket.listen(options, () =>
    {
      log.info(`Server listening to ${this.socket.address().address}:${this.socket.address().port}`);
    });
  }
  onConnection(connection)
  {
    //log.info('Client connection from %s:%s', connection.remoteAddress, connection.remotePort);
    log.info(`Client connection from ${connection.remoteAddress}:${connection.remotePort}`);
    this.parent.connections.push(connection);
    this.parent.onConnectionEvent(connection);
  }
}

exports.tcpClient = class tcpClient extends tcpClientServer
{
  constructor(options)
  {
    super();
    this.socket = new net.Socket();
    this.socket.parent = this;
    this.socket.connect(options, this.onConnection);
  }
  onConnection(connection)
  {
    log.info('Connected to TCP server ');
    this.parent.onConnectionEvent(this.parent.socket);
  }
}
