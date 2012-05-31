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

var uuid = require("node-uuid"),
    util = require("util"),
    zmq = require("zmq"),
    _ = require("underscore"),
    nodeEvents = require("events"),
    events = require("./events"),
    etc = require("./etc");

//The default channel capacity
var CHANNEL_CAPACITY = 100;

//How long to wait before sending a message if a remote buffer is full
var REMOTE_WAIT_TIMEOUT = 1000;

//Creates a new socket
//zmqSocket : Object
//      The underlying ZeroMQ socket to use
function Socket(zmqSocket) {
    var self = this;
    self._zmqSocket = zmqSocket;
    etc.eventProxy(self._zmqSocket, self, "error");

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

util.inherits(Socket, nodeEvents.EventEmitter);

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
    this._zmqSocket.bind(endpoint);
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
function MultiplexingSocket(zmqSocket) {
    Socket.call(this, zmqSocket);
    var self = this;

    //A UUID associated with all channels opened by this multiplexing socket
    self._uuid = uuid.v4();

    //A counter to ensure uniqueness with new channels
    self._channelIdCounter = 0;

    //Map of open channel IDs => channel objects
    self.channels = {};

    //Route events to a channel if possible; otherwise emit the event
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

//Opens a new channel
//srcEvent : Object or null
//      The ZeroRPC event that caused the channel to be opened, or null if
//      this is a fresh channel.
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

//Closes the socket
MultiplexingSocket.prototype.close = function() {
    this._zmqSocket.close();

    for(var id in this.channels) {
        this.channels[id].close();
    }
}

//Creates a new channel
//envelope : Array of Buffers
//      The ZeroMQ envelope of the remote endpoint that caused the channel to
//      be opened
//id : String
//      A unique ID for the channel
//fresh : Boolean
//      Whether the channel was opened by the local process
//socket : MultiplexingSocket
//      The socket that opened the channel
//capacity : Number
//      The channel buffer's capacity
function Channel(envelope, id, fresh, socket, capacity) {
    this._envelope = envelope;
    this._id = id;
    this._fresh = fresh;
    this._socket = socket;
    this._capacity = capacity;
    
    //The counter ensures that each message has a unique ID, and the random
    //number ensures that messages are unique between local and remote (if we
    //used only a counter for message uniqueness, they wouldn't be globally
    //unique)
    this._messageIdPrefix = Math.random().toString(16).substring(2);
    this._messageIdCounter = 0;

    //Callbacks to call when the channel receives a message
    this._callbacks = [];

    this._outBuffer = new ChannelBuffer(1);
    this._inBuffer = new ChannelBuffer(capacity);
}

util.inherits(Channel, nodeEvents.EventEmitter);

//Sends a message on a channel
//name : String
//      The event name
//args : Array
//      The event arguments
Channel.prototype.send = function(name, args) {
    var self = this;
    var buffer = self._outBuffer;

    if(self._fresh) {
        //Use the channel ID if this channel was opened by a local
        //operation and it is the first message
        self._fresh = false;
        var messageId = self._id;
        var responseTo = null;
    } else {
        //Otherwise, generate a new message ID
        var messageId = self._id + "-" + self._messageIdPrefix + "-" + (self._messageIdCounter++);
        var responseTo = self._id;
    }

    //Create the event header
    var header = { v: 2, message_id: messageId };
    if(responseTo) header.response_to = responseTo;

    //Create & enqueue the event
    var event = events.create(self._envelope, header, name, args);
    buffer.add(event);

    var doSend = function() {
        var capacity = buffer.capacity();
        if(capacity > 0) buffer.capacity(capacity - 1);
        self._socket.send(buffer.remove());
    }

    if(buffer.capacity() > 0) {
        //Send the message immediately if we think there's space in the remote
        //buffer
        doSend();
    } else {
        //Enqueue the message to be sent later if we think the remote buffer
        //is full
        setTimeout(doSend, REMOTE_WAIT_TIMEOUT);
    }
};

//Registers a new callback to be run when this channel receives a message
//callback : Function(event : Object, next : Function)
//      The callback to execute when a new event is received. Unless the
//      callback is the last in the chain, it should call its next argument
//      when its work is complete, so that the next callback can be run.
Channel.prototype.register = function(callback) {
    this._callbacks.push(callback);
};

//Called when the channel receives an event
//event : Object
//      The ZeroRPC event received
Channel.prototype.invoke = function(event) {
    var self = this;
    var buffer = self._inBuffer;

    if(event.name == "_zpc_more") {
        //Update buffer data
        if(event.args.length > 0 && typeof(event.args[0]) == "number") {
            self._outBuffer.capacity(event.args[0]);
        } else {
            self.emit("error", "Invalid event: Bad buffer message");
        }
    } else {
        //Otherwise enqueue the message in the buffer
        buffer.add(event);
        buffer.capacity(buffer.capacity() - 1);

        //Update the remote process with how much open capacity we have in
        //our buffer
        if(buffer.capacity() <= 0) {
            var newCapacity = self._capacity - buffer.length();
            buffer.capacity(newCapacity);
            this.send("_zpc_more", [newCapacity]);
        }

        //Call the callback asynchronously
        setTimeout(function() {
            var event = buffer.remove();
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

//Closes the channel and removes it from the multiplexing socket
Channel.prototype.close = function() {
    this.emit("close");
    delete this._socket.channels[this._id];
}

//Creates a new channel buffer
//capacity : number
//      The capacity of the buffer
function ChannelBuffer(capacity) {
    //Pre-allocate the buffer array to its capacity and set the length to 0.
    //This way, the length property is correct, but the array size equals
    //the maximum buffer size, so it doesn't have to be resized (as much).
    this._buffer = new Array(capacity);
    this._buffer.length = 0;
    this._capacity = capacity;
}

//Adds an item to the buffer
ChannelBuffer.prototype.add = function(item) {
    this._buffer.push(item);
};

//Removes an item from the buffer
ChannelBuffer.prototype.remove = function() {
    return this._buffer.shift();
}

//Gets the number of items in the buffer
ChannelBuffer.prototype.length = function() {
    return this._buffer.length;
};

//Gets or sets the buffer capacity
ChannelBuffer.prototype.capacity = function(value) {
    if(value !== undefined) {
        this._capacity = value;
    } else {
        return this._capacity;
    }
};

//Creates a new multiplexing socket server
function server() {
    return new MultiplexingSocket(zmq.socket("xrep"));
}

//Creates a new multiplexing socket client
function client() {
    return new MultiplexingSocket(zmq.socket("xreq"));
}

exports.server = server;
exports.client = client;