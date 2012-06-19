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

var socket = require("./socket"),
    _ = require("underscore"),
    nodeUtil = require("util"),
    events = require("events"),
    util = require("./util"),
    middleware = require("./middleware");

//Gets the arguments associated with a function as an array
//fun : Function
//      The function to get the arguments from.
//return : Array of Strings
//      The function's arguments
function getArguments(fun) {
    var m1 = /^[\s\(]*function[^(]*\(([^)]*)\)/,
        m2 = /\/\/.*?[\r\n]|\/\*(?:.|[\r\n])*?\*\//g,
        m3 = /\s+/g;

    var names = fun.toString().match(m1)[1].replace(m2, '').replace(m3, '').split(',');
    return names.length == 1 && !names[0] ? [] : names;
}

//Extracts the public methods (and their arguments) of a context.
//context : Object
//      The object to be exposed
//return : Object of String => Array
//      A map where they key is the method name and the value are the method
//      arguments, not including the callback argument.
function publicMethods(context) {
    var methods = {};

    //Ignore members that start with an underscore or are not functions
    for(var name in context) {
        if(!/^_/.test(name) && typeof(context[name]) == 'function') {
            var args = getArguments(context[name]);

            //Remove the last argument from the args becase it is the callback
            args.pop();

            methods[name] = args;
        }
    }

    return methods;
}

//Adds the new-school introspector function to a context
//context : Object
//      The object to be exposed
//methods : Object
//      The set public methods of the exposed object
function addIntrospector(context, methods) {
    var results = {};

    for(var name in methods) {
        results[name] = {
            doc: "",

            args: _.map(methods[name], function(arg) {
                return { name: arg };
            })
        };
    }

    methods._zpc_inspect = true;

    context._zpc_inspect = function(reply) {
        reply(results);  
    };
}

//Adds the old-school introspector function to a context
//context : Object
//      The object to be exposed
//methods : Object
//      The set public methods of the exposed object
function addLegacyIntrospector(context, methods) {
    methods._zerorpc_inspect = true;

    context._zerorpc_inspect = function(method, longDoc, reply) {
        if(method) {
            var key = "method";
            var filteredMethods = _.filter(methods, function(args, name) {
                return name === method;
            });
        } else {
            var key = "methods";
            var filteredMethods = methods;
        }

        var results = {};

        results[key] = _.map(filteredMethods, function(args, name) {
            return [name, [_.clone(args), null, null, null], ""];
        });

        reply(results);
    };
}

// Creates a new server
// context : Object
//      The object to expose
function Server(context) {
    var self = this;

    self._socket = socket.server();
    util.eventProxy(self._socket, self, "error");

    var methods = publicMethods(context);
    addIntrospector(context, methods);
    addLegacyIntrospector(context, methods);

    self._socket.on("multiplexing-socket/receive", function(event) {
        if(event.name in methods) self._recv(event, context);
    });
}

nodeUtil.inherits(Server, events.EventEmitter);

//Called when a method call event is received
//event : Object
//      The ZeroRPC event
//context : Object
//      The object to expose.
Server.prototype._recv = function(event, context) {
    var self = this;
    var ch = self._socket.openChannel(event);
    var isFirst = true;

    //Adds heartbeating
    middleware.addHeartbeat(ch, function(error) {
        if(error) self.emit("error", error);
    });

    //Sends an error
    var sendError = function(error) {
        var args = [error.type || "Error", error.message, error.stack];
        ch.send("ERR", args);
        ch.close();
    };

    //This is passed to RPC methods to call when they finish, or have a stream
    //update
    var result = function(error, item, more) {
        if(arguments.length === 0) {
            more = false;
        } else if(arguments.length === 1) {
            more = false;
            item = error;
            error = undefined;
        } else if(arguments.length === 2) {
            more = item;
            item = error;
            error = undefined;
        }

        if(error) {
            //Create an error object if we were passed a string
            sendError(typeof(error) == 'string' ? new Error(error) : error);
        } else {
            if(isFirst && !more) {
                //Wrap item in an array for backwards compatibility issues
                //with ZeroRPC
                ch.send("OK", [item]);
            } else if(item !== undefined) {
                //Stream is a newer method that does not require item to be
                //wrapped in an array
                ch.send("STREAM", item);
            }

            if(!more) {
                if(!isFirst) ch.send("STREAM_DONE", []);
                ch.close();
            }
        }
        
        isFirst = false;
    };

    //The arguments should be an array
    if(!(event.args instanceof Array)) {
        self.emit("error", "Invalid event: Bad args");
        return ch.close();
    }

    //Call the method
    event.args.push(result);
    
    //Catch any errors and send them back to the client
    try {
        context[event.name].apply(context, event.args);
    } catch(e) {
        sendError(e);
    }
}

//Binds to a ZeroMQ endpoint
//endpoint : String
//      The ZeroMQ endpoint
Server.prototype.bind = function(endpoint) {
    this._socket.bind(endpoint);
};

//Connects to a ZeroMQ endpoint
//endpoint : String
//      The ZeroMQ endpoint
Server.prototype.connect = function(endpoint) {
    this._socket.connect(endpoint);
};

//Closes the server
Server.prototype.close = function() {
    this._socket.close();
};

exports.Server = Server;