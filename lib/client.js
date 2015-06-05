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

var socket = require("./socket"),
    _ = require("underscore"),
    nodeUtil = require("util"),
    events = require("events"),
    util = require("./util"),
    middleware = require("./middleware");

var DEFAULT_TIMEOUT = 30;

//Heartbeat rate in milliseconds
var DEFAULT_HEARTBEAT = 5000;

// Creates a new client
// options : Object
//      Options associated with the client. Allowed options:
//      * timeout (number): Seconds to wait for a response before it is
//        considered timed out (default 30s)
//      * heartbeatInterval (number): The heartbeat interval in ms. 
//        (default 5000ms)
function Client(options) {
    options = options || {};
    var heartbeat = options.heartbeatInterval || DEFAULT_HEARTBEAT
    this._timeout = options.timeout || DEFAULT_TIMEOUT;
	this._socket = socket.client(heartbeat);

	util.eventProxy(this._socket, this, "error");
}

nodeUtil.inherits(Client, events.EventEmitter);

//Binds to a ZeroMQ endpoint
//endpoint : String
//      The ZeroMQ endpoint
Client.prototype.bind = function(endpoint) {
    this._socket.bind(endpoint);
};

//Connects to a ZeroMQ endpoint
//endpoint : String
//      The ZeroMQ endpoint
Client.prototype.connect = function(endpoint) {
    this._socket.connect(endpoint);
};

//Closes the client
Client.prototype.close = function(linger) {
    this._socket.close(linger);
};

Client.prototype.closed = function() {
    return this._socket.closed();
};

//Calls a remote method
//method : String
//      The method name
//args... : Varargs
//      The arguments to send with the invocation
//callback : Function
//      The callback to call on an update
Client.prototype.invoke = function(method /*, args..., callback*/) {
    var self = this,
        hasCallback = typeof arguments[arguments.length - 1] == 'function',
        callback = hasCallback ? arguments[arguments.length - 1] : function() {},
        args = Array.prototype.slice.call(arguments, 1, 
            hasCallback ? arguments.length - 1 : arguments.length);

    var callbackErrorWrapper = function(error) {
        callback(error, undefined, false);
    };

    var ch = self._socket.openChannel();
    middleware.addTimeout(self._timeout * 1000, ch, callbackErrorWrapper);

    //Associated callbacks to execute for various events
    var handlers = {
        "ERR": function(event) {
            if(!(event.args instanceof Array) || event.args.length != 3) {
                return self.emit("error", "Invalid event: Bad error");
            }

            var error = util.createErrorResponse(event.args[0], event.args[1], event.args[2]);
            callbackErrorWrapper(error);
            ch.close();
        },

        "OK": function(event) {
            callback(undefined, event.args[0], false);
            ch.close();
        },

        "STREAM": function(event) {
            callback(undefined, event.args, true);
        },

        "STREAM_DONE": function() {
            callback(undefined, undefined, false);
            ch.close();
        }
    };
    
    ch.register(function(event) {
        var handler = handlers[event.name];

        if(handler) {
            handler(event);
        } else {
            //Send an error if the server sent a bad event - this should
            //never happen
            var error = util.createErrorResponse("ProtocolError", "Invalid event: Unknown event name");
            callbackErrorWrapper(error);
            ch.close();
        }
    });

    //Listen for protocol errors - this should never happen
    ch.on("protocol-error", function(error) {
        var error = util.createErrorResponse("ProtocolError", error);
        callbackErrorWrapper(error);
    });

    //Listen for heartbeat errors
    ch.on("heartbeat-error", function(error) {
        var error = util.createErrorResponse("HeartbeatError", error);
        callbackErrorWrapper(error);
    });

    ch.send(method, args);
};

exports.Client = Client;
