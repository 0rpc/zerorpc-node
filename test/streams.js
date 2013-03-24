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

var rpcServer = new zerorpc.Server({
    lazyIter: function(from, to, step, reply) {
        var counter = from;

        var interval = setInterval(function() {
            if(counter < to) {
                reply(null, counter, true);
                counter += step;
            } else {
                reply();
                clearTimeout(interval);
            }
        }, 3000);
    }
});

rpcServer.bind("tcp://0.0.0.0:4246");

var rpcClient = new zerorpc.Client({ timeout: 5 });
rpcClient.connect("tcp://localhost:4246");

function lazyIterRunner(test, callback) {
    var nextExpected = 10;

    rpcClient.invoke("lazyIter", 10, 20, 2, function(error, res, more) {
        test.ifError(error);

        if(nextExpected == 20) {
            test.equal(res, null);
            test.equal(more, false);
            callback();
        } else {
            test.equal(res, nextExpected);
            test.equal(more, true);
            nextExpected += 2;
        }
    });
}

exports.testConcurrentRequests = function(test) {
    test.expect(90);

    var results = 0;

    for(var i=0; i<5; i++) {
        lazyIterRunner(test, function() {
            results++;
            if(results === 5) {
                rpcServer.close();
                test.done();
            }
        });
    }
};
