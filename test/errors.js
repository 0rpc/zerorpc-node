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
    simpleError: function(reply) {
        reply("This is an error, man!", undefined, false);
    },

    objectError: function(reply) {
        reply(new Error("This is an error object, man!"), undefined, false);
    },

    streamError: function(reply) {
        reply("This is a stream error, man!", undefined, false);

        var error = false;

        try {
            reply(null, "Should not happen");
        } catch(e) {
            error = true;
        }

        if(!error) {
            throw new Error("An error should have been thrown");
        }
    }
});

rpcServer.bind("tcp://0.0.0.0:4243");

var rpcClient = new zerorpc.Client();
rpcClient.connect("tcp://localhost:4243");

exports.testSimpleError = function(test) {
    test.expect(3);

    rpcClient.invoke("simpleError", function(error, res, more) {
        test.equal(error.message, "This is an error, man!");
        test.equal(res, null);
        test.equal(more, false);
        test.done();
    });
};

exports.testObjectError = function(test) {
    test.expect(3);

    rpcClient.invoke("objectError", function(error, res, more) {
        test.equal(error.message, "This is an error object, man!");
        test.equal(res, null);
        test.equal(more, false);
        test.done();
    });
};

exports.testStreamError = function(test) {
    test.expect(3);

    rpcClient.invoke("streamError", function(error, res, more) {
        test.equal(error.message, "This is a stream error, man!");
        test.equal(res, null);
        test.equal(more, false);
        rpcServer.close();
        test.done();
    });
};