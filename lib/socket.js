// Open Source Initiative OSI - The MIT License (MIT):Licensing
//
// The MIT License (MIT)
// Copyright (c) 2012 DotCloud Inc (opensource@dotcloud.com)
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the "Software"),
// to deal in the Software without restriction, including without limitation
// the rights to use, copy, modify, merge, publish, distribute, sublicense,
// and/or sell copies of the Software, and to permit persons to whom the
// Software is furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
// FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
// DEALINGS IN THE SOFTWARE.

var nodeUtil = require("util"),
    zmq = require("zmq"),
    nodeEvents = require("events"),
    events = require("./events"),
    util = require("./util"),
    channel = require("./channel");

//The default channel capacity
var CHANNEL_CAPACITY = 100;

//Creates a new socket
//zmqSocket : Object
//      The underlying ZeroMQ socket to use
function Socket(zmqSocket) {
    var self = this;
    self._zmqSocket = zmqSocket;
    util.eventProxy(self._zmqSocket, self, "error");

    var error = function(message) {
        self.emit("error", message);
    };

    self._zmqSocket.on("message", function() {
        //Deserialize the object and perform some sanity checks
        if(arguments[arguments.length - 2].length != 0) {
            return error("Expected second to last argument to be an empty buffer, but it is not");
        }

        var envelope = Array.prototype.slice.call(arguments, 0, arguments.length - 2);

        try {
            var event = events.deserialize(envelope, arguments[arguments.length - 1]);
        } catch(e) {
            return error("Invalid event: " + e);
        }

        //Emit the event
        self.emit("socket/receive", event);
    });
}

nodeUtil.inherits(Socket, nodeEvents.EventEmitter);

//Sends a message on the socket
//event : Object
//      The ZeroRPC event to send
Socket.prototype.send = function(event) {
    var message = events.serialize(event);
    this._zmqSocket.send.call(this._zmqSocket, message);
};

//Binds to a ZeroMQ endpoint
//endpoint : String
//      The ZeroMQ endpoint
Socket.prototype.bind = function(endpoint) {
    this._zmqSocket.bindSync(endpoint);
}

//Connects to a ZeroMQ endpoint
//endpoint : String
//      The ZeroMQ endpoint
Socket.prototype.connect = function(endpoint) {
    this._zmqSocket.connect(endpoint);
}

//Creates a new multiplexing socket
//zmqSocket : Object
//      The underlying ZeroMQ socket to use
function MultiplexingSocket(zmqSocket, heartbeat) {
    Socket.call(this, zmqSocket);
    var self = this;

    //Map of open channel IDs => channel objects
    self.channels = {};
    self._heartbeatInterval = heartbeat

    //Route events to a channel if possible; otherwise emit the event
    self.on("socket/receive", function(event) {
        var ch = self.channels[event.header.response_to || ""];

        if(ch) {
            ch.invoke(event);
        } else {
            self.emit("multiplexing-socket/receive", event);
        }
    });
}

nodeUtil.inherits(MultiplexingSocket, Socket);

//Opens a new channel
//srcEvent : Object or null
//      The ZeroRPC event that caused the channel to be opened, or null if
//      this is a locally opened channel.
MultiplexingSocket.prototype.openChannel = function(srcEvent) {
    if(srcEvent) {
        var ch = new channel.ServerChannel(srcEvent, this, CHANNEL_CAPACITY, this._heartbeatInterval);
    } else {
        var ch = new channel.ClientChannel(this, CHANNEL_CAPACITY, this._heartbeatInterval);
    }

    this.channels[ch.id] = ch;
    return ch;
};

//Closes the socket
MultiplexingSocket.prototype.close = function(linger) {
    if (linger !== undefined) {
        this._zmqSocket.setsockopt(zmq.options.linger, linger);
    }

    this._zmqSocket.close();
    for(var id in this.channels) this.channels[id].close();
};

MultiplexingSocket.prototype.setTimeout = function(timeout) {
};

//Creates a new multiplexing socket server
function server(heartbeat) {
    return new MultiplexingSocket(zmq.socket("xrep"), heartbeat);
}

//Creates a new multiplexing socket client
function client(heartbeat) {
    return new MultiplexingSocket(zmq.socket("xreq"), heartbeat);
}

exports.server = server;
exports.client = client;
