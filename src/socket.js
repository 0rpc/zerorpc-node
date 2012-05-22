var uuid = require("node-uuid"),
    util = require("util"),
    zmq = require("zmq"),
    _ = require("underscore"),
    nodeEvents = require("events"),
    events = require("./events"),
    etc = require("./etc");

var CHANNEL_CAPACITY = 100;
var REMOTE_WAIT_TIMEOUT = 1000;

function debug(type, msg) {
    /*var msgpack = require("msgpack2");
    var copy = [];

    for(var i=0; i<msg.length; i++) {
        if(i == msg.length - 1) {
            copy.push(msgpack.unpack(msg[i]));
        } else {
            copy.push(msg[i].toString());
        }
    }

    console.log(type, copy);*/
}

function Socket(zmqSocket) {
    var self = this;
    self._zmqSocket = zmqSocket;
    etc.eventProxy(self._zmqSocket, self, "error");

    var error = function(message) {
        self.emit("error", message);
    };

    self._zmqSocket.on("message", function() {
        debug("RECV", arguments);

        if(arguments[arguments.length - 2].length != 0) {
            return error("Expected second to last argument to be an empty buffer, but it is not");
        }

        var envelope = Array.prototype.slice.call(arguments, 0, arguments.length - 2);

        try {
            var event = events.deserialize(envelope, arguments[arguments.length - 1]);
        } catch(e) {
            return error("Invalid event: " + e);
        }

        self.emit("socket/receive", event);
    });
}

util.inherits(Socket, nodeEvents.EventEmitter);

Socket.prototype.send = function(event) {
    var message = events.serialize(event);
    debug("SEND", message);
    this._zmqSocket.send.call(this._zmqSocket, message);
};

Socket.prototype.bind = function(endpoint) {
    this._zmqSocket.bind(endpoint);
}

Socket.prototype.connect = function(endpoint) {
    this._zmqSocket.connect(endpoint);
}

function MultiplexingSocket(zmqSocket) {
    Socket.call(this, zmqSocket);
    var self = this;

    self._uuid = uuid.v4();
    self._channelIdCounter = 0;
    self.channels = {};

    self.on("socket/receive", function(event) {
        var channel = self.channels[event.header.response_to || ""];

        if(channel) {
            channel.invoke(event);
        } else {
            self.emit("multiplexing-socket/receive", event);
        }
    });
}

util.inherits(MultiplexingSocket, Socket);

MultiplexingSocket.prototype.openChannel = function(srcEvent) {
    if(srcEvent) {
        var id = srcEvent.header.message_id;
        var channel = new Channel(srcEvent.envelope, id, false, this, CHANNEL_CAPACITY);
    } else {
        var id = this._uuid + "-" + (this._channelIdCounter++);
        var channel = new Channel(null, id, true, this, CHANNEL_CAPACITY);
    }

    this.channels[id] = channel;
    return channel;
};

function Channel(envelope, id, fresh, socket, capacity) {
    this._envelope = envelope;
    this._id = id;
    this._fresh = fresh;
    this._socket = socket;
    this._capacity = capacity;
    
    this._messageIdPrefix = Math.random().toString(16).substring(2);
    this._messageIdCounter = 0;
    this._callbacks = [];
    this._remoteCapacity = 1;
    this._reservedCapacity = 1;

    this._buffer = new Array(capacity);
    this._buffer.length = 0;
}

util.inherits(Channel, nodeEvents.EventEmitter);

Channel.prototype.send = function(name, args) {
    var self = this;

    var doSend = function() {
        if(self._fresh) {
            self._fresh = false;
            var messageId = self._id;
            var responseTo = null;
        } else {
            var messageId = self._id + "-" + self._messageIdPrefix + "-" + (self._messageIdCounter++);
            var responseTo = self._id;
        }

        var header = { v: 2, message_id: messageId };
        if(responseTo) header.response_to = responseTo;

        var event = events.create(self._envelope, header, name, args);
        self._socket.send(event);
    };

    if(this._remoteCapacity > 0) {
        this._remoteCapacity--;
        doSend();
    } else {
        setTimeout(doSend, REMOTE_WAIT_TIMEOUT);
    }
};

Channel.prototype.register = function(callback) {
    this._callbacks.push(callback);
};

Channel.prototype.invoke = function(event) {
    var self = this;
    var buffer = self._buffer;

    if(event.name == "_zpc_more") {
        if(event.args.length > 0 && typeof(event.args[0]) == "number") {
            self._remoteCapacity = event.args[0];
        } else {
            self.emit("error", "Invalid event: Bad buffer message");
        }
    } else {
        buffer.push(event);
        self._reservedCapacity--;

        if(self._reservedCapacity <= 0) {
            self._reservedCapacity = self._capacity - buffer.length;
            this.send("_zpc_more", [self._reservedCapacity]);
        }

        //Call the callback asynchronously
        setTimeout(function() {
            var event = buffer.shift();
            var i = -1;

            var next = function() { 
                i++;

                if(i < self._callbacks.length) {
                    self._callbacks[i].call(this, event, next);
                }
            }

            next();
        }, 0);
    }
};

Channel.prototype.close = function() {
    this.emit("close");
    delete this._socket.channels[this._id];
}

function server() {
    return new MultiplexingSocket(zmq.socket("xrep"));
}

function client() {
    return new MultiplexingSocket(zmq.socket("xreq"));
}

exports.server = server;
exports.client = client;