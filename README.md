zerorpc-node
============

[![Build Status](https://travis-ci.org/0rpc/zerorpc-node.svg?branch=master)](https://travis-ci.org/0rpc/zerorpc-node)

ZeroRPC is a communication layer for distributed systems. zerorpc-node is a port of the original [ZeroRPC](https://github.com/0rpc/zerorpc-python) for node.js. We have full client and server support for version 3 of the protocol, and clients/servers written in the Python version can communicate transparently with those written in node.js. This project is in alpha.

To install the package:

    npm install zerorpc

If you get the error `Package libzmq was not found`, take a look at [the fix for zeromq.node](https://github.com/JustinTulloss/zeromq.node/issues/55). If you get the error `Unable to load shared library <<path to zeromq.node>>/binding.node`, [make sure you run ldconfig](https://github.com/JustinTulloss/zeromq.node/issues/85). If that still doesn't work, check out [this ticket](https://github.com/JustinTulloss/zeromq.node/issues/92).

Servers
-------

To create a new server:

    var zerorpc = require("zerorpc");
    var server = new zerorpc.Server(context [, heartbeat]);

The constructor takes in a context object with the functions to expose
over RPC. Only functions that do not have a leading underscore will be
exposed. Each exposed method must take in a callback as the last
argument. This callback is called as `callback(error, response, more)`
when there is a new update, where error is an error object or string,
response is the new update, and more is a boolean specifying whether new
updates will be available later. `error`, `response`, and `more` default
to falsy values, so e.g. simply calling `callback()` closes an open
stream, since `more` is false by default. Constructor also takes a
heartbeat parameter that specifies the interval that the server should
ping clinets to let them know it is active.

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
            reply(null, sentence + ", man!");
        },

        add42: function(n, reply) {
            reply(null, n + 42);
        },

        iter: function(from, to, step, reply) {
            for(i=from; i<to; i+=step) {
                reply(null, i, true);
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
* `heartbeatInterval` (number) - Sets the number of miliseconds to send send heartbeats to connected servers. Defaults to 5000ms.

Events:

* `error` - When an error occurs.

Methods:

* `bind(endpoint)` - Binds the client to the specified ZeroMQ endpoint.
* `connect(endpoint)` - Connects the client to the specified ZeroMQ endpoint.
* `close()` - Closes the ZeroMQ socket.
* `invoke(method, arguments..., callback)` - Invokes a remote method.
  * `method` is the method name.
  * `callback` is a method to call when there is an update. This callback is called as `callback(error, response, more)`, where error is an error object, response is the new update, and more is a boolean specifying whether new updates will be available later (i.e. whether the response is streaming).

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


