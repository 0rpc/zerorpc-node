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

/* This test reproduces issue 26 (server is garbage-collected if no client connection
    happens before some time). This bug was happening with zmq<2.2.0. */
var zerorpc = require(".."),
    _ = require("underscore");

var rpcServer = new zerorpc.Server({
    helloWorld: function(reply) {
        reply(null, "received data")
    }
});

rpcServer.bind("tcp://0.0.0.0:4247");

var rpcClient = new zerorpc.Client({ timeout: 5 });
exports.testRepro26 = function(test) {
  rpcClient.connect("tcp://localhost:4247");
  var i = 0;
  var run = function() {
    rpcClient.invoke("helloWorld", function(error, res) {
      i++;
      if (i < 100) {
        run();  
      } else {
        test.equal(Object.keys(rpcServer._socket.channels).length, 0);
        rpcServer.close();
        test.done(); 
      }
    }); 
  }
  run();
};
