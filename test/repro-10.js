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

/* This test reproduces issue 10 (server is garbage-collected if no client connection
    happens before some time). This bug was happening with zmq<2.2.0. */
var zerorpc = require(".."),
    _ = require("underscore");

var rpcServer = new zerorpc.Server({
    helloWorld: function(reply) {
        reply(null, "Hello World!")
    }
});

rpcServer.bind("tcp://0.0.0.0:4247");

var rpcClient = new zerorpc.Client({ timeout: 5 });
exports.testRepro10 = function(test) {
    setTimeout(function() {
        rpcClient.connect("tcp://localhost:4247");
        rpcClient.invoke("helloWorld", function(error, res, more) {
            test.equal(error, null);
            test.equal(res, "Hello World!");
            test.equal(more, false);
            rpcServer.close();
            test.done();
        });
    }, 10000);
};