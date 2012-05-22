var socket = require("./socket"),
    _ = require("underscore"),
    util = require("util"),
    events = require("events"),
    etc = require("./etc"),
    middleware = require("./middleware");

var DEFAULT_HEARTBEAT = 5;

function getArguments(fun) {
    var m1 = /^[\s\(]*function[^(]*\(([^)]*)\)/,
        m2 = /\/\/.*?[\r\n]|\/\*(?:.|[\r\n])*?\*\//g,
        m3 = /\s+/g;

    var names = fun.toString().match(m1)[1].replace(m2, '').replace(m3, '').split(',');
    return names.length == 1 && !names[0] ? [] : names;
}

function publicMethods(context) {
    var methods = {};

    for(var name in context) {
        if(!/^_/.test(name) && typeof(context[name]) == 'function') {
            methods[name] = true;
        }
    }

    var inspected = [];

    for(var name in methods) {
        var args = ["self"].concat(getArguments(context[name]));
        inspected.push([name, [args, null, null, null], ""]);
    }

    var inspectedOutput = [{methods: inspected}];

    context._zerorpc_inspect = function(cb) {
        cb(null, inspectedOutput, false);
    };

    methods["_zerorpc_inspect"] = true;
    return methods;
}

function Server(endpoint, options) {
    options = options || {};
    this._socket = socket.server(endpoint);
    this._heartbeat = options.heartbeat || DEFAULT_HEARTBEAT;
    etc.eventProxy(this._socket, this, "error");
}

util.inherits(Server, events.EventEmitter);

Server.prototype._recv = function(event, heartbeat, context) {
    var self = this;
    var channel = self._socket.openChannel(event);
    var isFirst = true;
    var finished = false;

    middleware.addHeartbeat(heartbeat, channel, function(error) {
        if(error) self.emit("error", error);
    });

    var result = function(error, item, more) {
        if(finished) {
            return self.emit("error", "Result callback called after the channel was closed");
        } else if(error) {
            var errorObj = typeof(error) == 'string' ? new Error(error) : error;
            var args = [errorObj.type || "Error", errorObj.message, errorObj.stack];
            channel.send("ERR", args);
            finish();
        } else {
            if(isFirst && !more) {
                channel.send("OK", item);
            } else if(item != undefined) {
                channel.send("STREAM", item);
            }

            if(!more) {
                if(!isFirst) channel.send("STREAM_DONE", []);
                finish();
            }        
        }

        isFirst = false;
    };

    var finish = function() {
        finished = true;
        channel.close();
    };

    if(!(event.args instanceof Array)) {
        self.emit("error", "Invalid event: Bad args");
        return finish();
    }

    var args = [result].concat(event.args);
    context[event.name].apply(context, args);
}

Server.prototype.bind = function(endpoint) {
    this._socket.bind(endpoint);
};

Server.prototype.connect = function(endpoint) {
    this._socket.connect(endpoint);
};

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