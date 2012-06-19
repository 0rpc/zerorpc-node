zerorpc-node
============

This is a version of [ZeroRPC](https://github.com/dotcloud/zerorpc-python) for node.js. We have full client and server support for version 3 of the protocol. This project is alpha.

To install the package:

    npm install zerorpc

If you get the error `Package libzmq was not found`, take a look at [the fix for zeromq.node](https://github.com/JustinTulloss/zeromq.node/issues/55).

Servers
-------

To create a new server:

    var zerorpc = require("zerorpc");
    var server = new zerorpc.Server(context);

The constructor takes in a context object with the functions to expose over RPC. Only functions that do not have a leading underscore will be exposed. Each exposed method must take in a callback as the last argument. This callback is called as `callback(error, response, more)` when there is a new update, where error is an error object or string, response is the new update, and more is a boolean specifying whether new updates will be available later.

Events:

* `error` - When an error occurs.

Methods:

* `bind(endpoint)` - Binds the server to the specified ZeroMQ endpoint.
* `connect(endpoint)` - Connects the server to the specified ZeroMQ endpoint.
* `close()` - Closes the ZeroMQ socket.

Full example:

    var zerorpc = require("zerorpc");

    var server = new zerorpc.Server({
        addMan: function(sentence, reply) {
            reply(sentence + ", man!");
        },

        add42: function(n, reply) {
            reply(n + 42);
        },

        iter: function(from, to, step, reply) {
            for(i=from; i<to; i+=step) {
                reply(i, true);
            }

            reply();
        }
    });

    server.bind("tcp://0.0.0.0:4242");

    server.on("error", function(error) {
        console.error("RPC server error:", error);
    });

Clients
-------

To create a new client:

    var zerorpc = require("zerorpc");
    var client = new zerorpc.Client(options);

The constructor optionally takes in an options object. Allowable options:

* `timeout` (number) - Sets the number of seconds to wait for a response before considering the call timed out. Defaults to 30.

Events:

* `error` - When an error occurs.

Methods:

* `bind(endpoint)` - Binds the server to the specified ZeroMQ endpoint.
* `connect(endpoint)` - Connects the server to the specified ZeroMQ endpoint.
* `close()` - Closes the ZeroMQ socket.
* `invoke(method, arguments..., callback)` - Invokes a remote method.
  * `method` is the method name.
  * `callback` is a method to call when there is an update. This callback is called as `callback(error, response, more)` when there is a new update, where error is an error object, response is the new update, and more is a boolean specifying whether new updates will be available later. You can also do `callback()` to close a stream response, `callback(response)` to send a non-stream response without an error, or `callback(response, more)` for a response without an error.

Full example:

    var zerorpc = require("zerorpc");

    var client = new zerorpc.Client();
    client.connect("tcp://127.0.0.1:4242");

    client.on("error", function(error) {
        console.error("RPC client error:", error);
    });

    client.invoke("iter", 10, 20, 2, function(error, res, more) {
        if(error) {
            console.error(error);
        } else {
            console.log("UPDATE:", res);
        }

        if(!more) {
            console.log("Done.");
        }
    });