var socket = require("./socket"),
    _ = require("underscore"),
    util = require("util"),
    events = require("events"),
    etc = require("./etc"),
    middleware = require("./middleware");

var DEFAULT_HEARTBEAT = 5;

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

//Extracts the public methods of a context, and injects a method to introspect
//on the context.
//context : Object
//      The object to be exposed
//return : Object of String => Boolean
//      The set of public methods
function publicMethods(context) {
    var methods = {};

    //Ignore members that start with an underscore or are not functions
    for(var name in context) {
        if(!/^_/.test(name) && typeof(context[name]) == 'function') {
            methods[name] = true;
        }
    }

    //Build a data structure that contains the introspected information.
    //TODO: this is messy right now to be compatible with zerorpc-python.
    //Should be fixed at some point.
    var inspected = [];

    for(var name in methods) {
        var args = ["self"].concat(getArguments(context[name]));
        inspected.push([name, [args, null, null, null], ""]);
    }

    var inspectedOutput = [{methods: inspected}];

    //Inject the introspector.
    context._zerorpc_inspect = function(cb) {
        cb(null, inspectedOutput, false);
    };

    methods["_zerorpc_inspect"] = true;
    return methods;
}

// Creates a new server
// options : Object
//      Options associated with the server. Allowed options:
//      * heartbeat (number): Seconds in between heartbeat requests
//        (default 5s)
function Server(options) {
    options = options || {};
    this._socket = socket.server();
    this._heartbeat = options.heartbeat || DEFAULT_HEARTBEAT;
    etc.eventProxy(this._socket, this, "error");
}

util.inherits(Server, events.EventEmitter);

//Called when a method call event is received
//event : Object
//      The ZeroRPC event
//heartbeat : Number
//      The sleep time in between heartbeats, in seconds
//context : Object
//      The object to expose.
Server.prototype._recv = function(event, heartbeat, context) {
    var self = this;
    var channel = self._socket.openChannel(event);
    var isFirst = true;
    var finished = false;

    //Adds heartbeating
    middleware.addHeartbeat(heartbeat, channel, function(error) {
        if(error) self.emit("error", error);
    });

    //This is passed to RPC methods to call when they finish, or have a stream
    //update
    var result = function(error, item, more) {
        if(finished) {
            //This should not happen, unless there is a bug in the calling method
            throw new Error("Result callback called after the channel was closed");
        } else if(error) {
            //Create an error object if we were passed a string
            var errorObj = typeof(error) == 'string' ? new Error(error) : error;
            var args = [errorObj.type || "Error", errorObj.message, errorObj.stack];
            channel.send("ERR", args);
            finish();
        } else {
            if(isFirst && !more) {
                //Wrap item in an array for backwards compatibility issues with ZeroRPC
                channel.send("OK", [item]);
            } else if(item != undefined) {
                //Stream is a newer method that does not require item to be wrapped in an array
                channel.send("STREAM", item);
            }

            if(!more) {
                if(!isFirst) channel.send("STREAM_DONE", []);
                finish();
            }        
        }

        isFirst = false;
    };

    //Cleans up
    var finish = function() {
        finished = true;
        channel.close();
    };

    //The arguments should be an array
    if(!(event.args instanceof Array)) {
        self.emit("error", "Invalid event: Bad args");
        return finish();
    }

    //Call the method
    var args = [result].concat(event.args);
    context[event.name].apply(context, args);
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

//Exposes an object to be used
//context : Object
//      The object to expose
//options : Object
//      Request-specific options that override the global server options.
//      Allowed options:
//      * heartbeat (number): Seconds in between heartbeat requests
//        (default 5s)
Server.prototype.expose = function(context, options) {
    options = options || {};

    var self = this;
    var heartbeat = (options.heartbeat || self._heartbeat) * 1000;
    var methods = publicMethods(context);

    self._socket.on("multiplexing-socket/receive", function(event) {
        if(event.name in methods) self._recv(event, heartbeat, context);
    });
};

exports.Server = Server;