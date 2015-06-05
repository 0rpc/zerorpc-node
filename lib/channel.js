// Open Source Initiative OSI - The MIT License (MIT):Licensing
//
// The MIT License (MIT)
// Copyright (c) 2015 François-Xavier Bourlet (bombela+zerorpc@gmail.com)
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

var util = require("./util"),
    nodeUtil = require("util"),
    nodeEvents = require("events"),
    events = require("./events"),
    buffer = require("./buffer");

//The channel state when it is open
var CHANNEL_OPEN = "open";

//The channel state when it is closing
var CHANNEL_CLOSING = "closing";

//The channel state when it is closed
var CHANNEL_CLOSED = "closed";

//Current verison of the protocol
var PROTOCOL_VERSION = 3;


//Creates a new channel
//id : String
//      The channel ID
//envelope : Array of Buffers
//      The ZeroMQ envelope of the remote endpoint that caused the channel to
//      be opened
//socket : MultiplexingSocket
//      The socket that opened the channel
//capacity : Number
//      The channel buffer's capacity
//heartbeatInterval: Number
//      The heartbeat interval in ms
function Channel(id, envelope, socket, capacity, heartbeatInterval) {
    this.id                 = id;
    this._state             = CHANNEL_OPEN;
    this._envelope          = envelope;
    this._socket            = socket;
    this._capacity          = capacity;
    this._heartbeatInterval = heartbeatInterval

    //Setup heartbeating on the channel
    this._resetHeartbeat();
    this._heartbeatRunner = this._runHeartbeat();

    //Callbacks to call when the channel receives a message
    this._callbacks = [];

    //Buffers for sending & receiving messages
    this._inBuffer = new buffer.ChannelBuffer(capacity);
    this._inBuffer.setCapacity(1);
    this._outBuffer = new buffer.ChannelBuffer(1);
}

nodeUtil.inherits(Channel, nodeEvents.EventEmitter);

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

    if(event.name == "_zpc_more") {
        //Update buffer data
        if(event.args.length > 0 && typeof(event.args[0]) == "number") {
            self._outBuffer.setCapacity(event.args[0]);
            self.flush();
        } else {
            self.emit("protocol-error", "Invalid event: Bad buffer message");
            self.destroy();
        }
    } else if(event.name == "_zpc_hb") {
        self._resetHeartbeat();
    } else if(self._state == CHANNEL_OPEN) {
        //Enqueue the message in the buffer
        self._inBuffer.add(event);
        self._inBuffer.decrementCapacity();

        //Call each callback one at a time, similar to connect middleware.
        //This is done asyncronously to take advantage of the buffer.
        setTimeout(function() {
            var event = self._inBuffer.remove();
            var i = -1;

            //Update the remote process with how much open capacity we have in
            //our buffer - but only if the event is not one that is going to
            //close the channel; otherwise we'll send a _zpc_more event, and
            //the server won't know how to route it
            if(event.name === "STREAM" && self._inBuffer.getCapacity() < self._capacity / 2) {
                self._resetCapacity();
            }

            var next = function() { 
                i++;

                if(i < self._callbacks.length) {
                    self._callbacks[i].call(self, event, next);
                }
            };

            next();
        }, 0);
    }
};

//Puts the channel in the closing state
Channel.prototype.close = function() {
    this._state = CHANNEL_CLOSING;
    this.emit("closing");
    this.flush();
};

//Close and destroy channel
Channel.prototype.destroy = function() {
    this._state = CHANNEL_CLOSED;
    this.emit("closed");
    clearTimeout(this._heartbeatRunner);
    delete this._socket.channels[this.id];
}

//Sends as many outbound messages as possible
Channel.prototype.flush = function() {
    while(this._outBuffer.length() > 0 && this._outBuffer.hasCapacity()) {
        this._socket.send(this._outBuffer.remove());
        this._outBuffer.decrementCapacity();
    }

    if(this._state == CHANNEL_CLOSING && this._outBuffer.length() == 0) {
        this.destroy();
    }
};

//Sends a message
//name : String
//      The event name
//args : Array
//      The event arguments
Channel.prototype.send = function(name, args) {
    if(this._state != CHANNEL_OPEN) {
        throw new Error("Cannot send on closed channel");
    }

    //Create & enqueue the event
    var event = events.create(this._envelope, this._createHeader(), name, args);

    //Send the message or enqueue it to be sent later
    if(this._outBuffer.hasCapacity()) {
        this._socket.send(event);
        this._outBuffer.decrementCapacity();
    } else {
        this._outBuffer.add(event);
    }
};

//Creates a header for an event
Channel.prototype._createHeader = function() {
    return { v: PROTOCOL_VERSION, message_id: events.fastUUID(), response_to: this.id };
};

//Runs the heartbeat on this channel
Channel.prototype._runHeartbeat = function() {
    var self = this;

    return setInterval(function() {
        if(util.curTime() > self._heartbeatExpirationTime) {
            //If we haven't received a response in 2 * heartbeat rate, send an
            //error
            self.emit("heartbeat-error", "Lost remote after " + (self._heartbeatInterval * 2) + "ms");
            self.destroy();
			return;
        }
        
        //Heartbeat on the channel
        try {
            var event = events.create(self._envelope, self._createHeader(), "_zpc_hb", [0]);
            self._socket.send(event);
        } catch(e) {
            console.error("Error occurred while sending heartbeat:", e);
        }
    }, self._heartbeatInterval);
};

//Resets the heartbeat expiration time
Channel.prototype._resetHeartbeat = function() {
    this._heartbeatExpirationTime = util.curTime() + this._heartbeatInterval * 2;
};

//Updates the capacity and sends a _zpc_more event
Channel.prototype._resetCapacity = function() {
    var newCapacity = this._capacity - this._inBuffer.length();
    
    if(newCapacity > 0) {
        this._inBuffer.setCapacity(newCapacity);
        var event = events.create(this._envelope, this._createHeader(), "_zpc_more", [newCapacity]);
        this._socket.send(event);
    }
};

//Creates a new server-side channel
//srcEvent : Object
//      The event that caused this channel to be opened
//socket : Object
//      The multiplexing socket instance that opened this channel
//capacity : Number
//      The capacity of the socket's input buffer
//heartbeatInterval: Number
//      The heartbeat interval in ms
function ServerChannel(srcEvent, socket, capacity, heartbeatInterval) {
    Channel.call(this, srcEvent.header.message_id, srcEvent.envelope, socket, capacity, heartbeatInterval);
}

nodeUtil.inherits(ServerChannel, Channel);

//Creates a new client-side buffer
//socket : Object
//      The multiplexing socket instance that opened this channel
//capacity : Number
//      The capacity of the socket's input buffer
//heartbeatInterval: Number
//      The heartbeat interval in ms
function ClientChannel(socket, capacity, heartbeatInterval) {
    Channel.call(this, events.fastUUID(), null, socket, capacity, heartbeatInterval);
    this._fresh = true;
    
}

nodeUtil.inherits(ClientChannel, Channel);

ClientChannel.prototype._createHeader = function(name, args) {
    if(this._fresh) {
        this._fresh = false;
        return { v: PROTOCOL_VERSION, message_id: this.id };
    } else {
        return Channel.prototype._createHeader.call(this);
    }
}

exports.ServerChannel = ServerChannel;
exports.ClientChannel = ClientChannel;
