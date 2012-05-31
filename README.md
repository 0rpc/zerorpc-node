zerorpc-node
============

This is a port of [ZeroRPC](https://github.com/dotcloud/zerorpc-python) to node.js. We have full client and server support for version 2 of the protocol, however there are issues with legacy support.

This project is alpha.

Servers
-------

To create a new server:

    var zerorpc = require("zerorpc/server");
    var server = new zerorpc.Server();

The constructor optionally takes in an options object. Allowable options:

* `heartbeat` (number) - Sets the heartbeat rate in seconds. Defaults to 5.

Events:

* `error` - When an error occurs.

Methods:

* `bind(endpoint)` - Binds the server to the specified ZeroMQ endpoint.
* `connect(endpoint)` - Connects the server to the specified ZeroMQ endpoint.
* `close()` - Closes the ZeroMQ socket.
* `expose(context, options)` - Exposes a new zeroservice.
  * `context` is an object with the exposed functions. Only functions that do not have a leading underscore will be exposed. Each exposed method must take in a callback as a first argument. This callback is called as `callback(error, response, more)` when there is a new update, where error is an error object or string, response is the new update, and more is a boolean specifying whether new updates will be available later.
  * `options` are the same as those taken in the constructor. If any options are specified, they will override the server-wide options for this zeroservice.

Full example:

    var zerorpc = require("zerorpc/server");

    var server = new zerorpc.Server();
    server.bind("tcp://0.0.0.0:4242");

    server.on("error", function(error) {
        console.error("RPC server error:", error);
    });

    server.expose({
        addMan: function(cb, sentence) {
            cb(null, sentence + ", man!");
        },

        add42: function(cb, n) {
            cb(null, n + 42);
        },

        iter: function(cb, from, to, step) {
            for(i=from; i<to; i+=step) {
                cb(null, i, true);
            }

            cb(null, undefined, false);
        }
    });

Clients
-------

To create a new client:

    var zerorpc = require("zerorpc/client");
    var client = new zerorpc.Client();

The constructor optionally takes in an options object. Allowable options:

* `heartbeat` (number) - Sets the heartbeat rate in seconds. Defaults to 5.
* `timeout` (number) - Sets the number of seconds to wait for a response before considering the call timed out. Defaults to 30.

Events:

* `error` - When an error occurs.

Methods:

* `bind(endpoint)` - Binds the server to the specified ZeroMQ endpoint.
* `connect(endpoint)` - Connects the server to the specified ZeroMQ endpoint.
* `close()` - Closes the ZeroMQ socket.
* `invoke(method, arguments, [options, callback])` - Invokes a remote method.
  * `method` is the method name.
  * `arguments` is an array of the method arguments.
  * `options` are the same as those taken in the constructor. If any options are specified, they will override the client-wide options for this request.
  * `callback` is a method to call when there is an update. This callback is called as `callback(error, response, more)` when there is a new update, where error is an error object, response is the new update, and more is a boolean specifying whether new updates will be available later.

