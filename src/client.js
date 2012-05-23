var socket = require("./socket"),
    _ = require("underscore"),
    util = require("util"),
    events = require("events"),
    etc = require("./etc"),
    middleware = require("./middleware");

var DEFAULT_TIMEOUT = 30;
var DEFAULT_HEARTBEAT = 5;

// Creates a new client
// options : Object
//      Options associated with the client. Allowed options:
//      * timeout (number): Seconds to wait for a response before it is
//        considered timed out (default 30s)
//      * heartbeat (number): Seconds in between heartbeat requests
//        (default 5s)
function Client(options) {
    options = options || {};
    this._socket = socket.client();
    this._timeout = options.timeout || DEFAULT_TIMEOUT;
    this._heartbeat = options.heartbeat || DEFAULT_HEARTBEAT;
    etc.eventProxy(this._socket, this, "error");
}

util.inherits(Client, events.EventEmitter);

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

//Calls a remote method
//method : String
//      The method name
//args : Array
//      The arguments to send with the invocation
//options : Object
//      Request-specific options that override the global client options.
//      Allowed options:
//      * timeout (number): Seconds to wait for a response before it is
//        considered timed out (default 30s)
//      * heartbeat (number): Seconds in between heartbeat requests
//        (default 5s)
//
Client.prototype.invoke = function(method, args, options, callback) {
    var self = this;

    if(callback === undefined) {
        callback = options;
        options = {};
    } else {
        options = options || {};
    }

    var timeout = (options.timeout || self._timeout) * 1000;
    var heartbeat = (options.heartbeat || self._heartbeat) * 1000;

    var callbackWrapper = function(error) {
        callback(error, undefined, false);
    };

    //TODO: return errors back to the server
    var channel = self._socket.openChannel();
    middleware.addTimeout(timeout, channel, callbackWrapper);
    middleware.addHeartbeat(heartbeat, channel, callbackWrapper);

    //Associated callbacks to execute for various events
    var handlers = {
        "ERR": function(event) {
            if(!(event.args instanceof Array) || event.args.length != 3) {
                return self.emit("error", "Invalid event: Bad error");
            }

            var error = etc.createErrorResponse(event.args[0], event.args[1], event.args[2]);
            callback(error, undefined, false);
            channel.close();
        },

        "OK": function(event) {
            callback(undefined, event.args, false);
            channel.close();
        },

        "STREAM": function(event) {
            callback(undefined, event.args, true);
        },

        "STREAM_DONE": function() {
            callback(undefined, undefined, false);
            channel.close();
        }
    };
    
    channel.register(function(event) {
        var handler = handlers[event.name];

        if(handler) {
            handler(event);
        } else {
            self.emit("error", "Invalid event: Unknown event name");
        }
    });

    channel.send(method, args);
};

exports.Client = Client;