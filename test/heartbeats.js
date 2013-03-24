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

var zerorpc = require(".."),
    _ = require("underscore");

var killed = false;

var rpcServer = new zerorpc.Server({
    lazyErrorableIter: function(reply) {
        var counter = 0;

        var interval = setInterval(function() {
            try {
                reply(null, counter, true);
            } catch(e) {
                killed = true;
                clearTimeout(interval);
            }

            counter++;
        }, 3000);
    }
});

rpcServer.on("error", function(error) {});

rpcServer.bind("tcp://0.0.0.0:4244");

var rpcClient = new zerorpc.Client({ timeout: 11000 });
rpcClient.connect("tcp://localhost:4244");

exports.testClose = function(test) {
    test.expect(1);

    var hit = false;

    rpcClient.invoke("lazyErrorableIter", function(error, res, more) {
        if(hit) {
            test.ok(false, "lazyErrorableIter() should not have been called more than once");
        } else {
            hit = true;
            test.ifError(error);
            rpcClient.close();

            //Repeatedly poll for a closed connection - if after 20 seconds
            //(2 heartbeats) the connection isn't closed, throw an error
            var numChecks = 0;
            var checkTimeout = setInterval(function() {
                if(killed) {
                    clearTimeout(checkTimeout);
                    rpcServer.close();
                    test.done();
                    return;
                }

                if(numChecks++ == 20) {
                    test.ok(false, "Connection not closed on the remote end");
                }
            }, 1000);
        }
    });
};