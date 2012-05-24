var server = require("../src/server"),
    client = require("../src/client");

var rpcServer = new server.Server();
rpcServer.bind("tcp://0.0.0.0:4242");

rpcServer.expose({
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
    },

    simpleError: function(cb) {
        cb("This is an error, man!", undefined, false);
    },

    objectError: function(cb) {
        cb(new Error("This is an error object, man!"), undefined, false);
    },

    streamError: function(cb) {
        cb("This is a stream error, man!", undefined, true);

        var error = false;
        
        try {
            cb(null, "Should not happen", false);
        } catch(e) {
            error = true;
        }

        if(!error) {
            throw new Error("An error should have been thrown");
        }
    },

    quiet: function(cb) {
        setTimeout(function() {
            cb(null, "Should not happen", false);
        }, 31 * 1000);
    }
});

var rpcClient = new client.Client();
rpcClient.connect("tcp://localhost:4242");

var badRpcClient = new client.Client();
badRpcClient.connect("tcp://localhost:4040");

function attachError(emitter) {
    emitter.on("error", function(error) {
        throw new Error(error);
    })
}

attachError(rpcServer, rpcClient);

exports.testNormalStringMethod = function(test) {
    test.expect(3);

    rpcClient.invoke("addMan", ["This is not an error"], function(error, res, more) {
        test.ifError(error);
        test.deepEqual(res, "This is not an error, man!");
        test.equal(more, false);
        test.done();
    });
};

exports.testNormalIntMethod = function(test) {
    test.expect(3);

    rpcClient.invoke("add42", [30], function(error, res, more) {
        test.ifError(error);
        test.deepEqual(res, 72);
        test.equal(more, false);
        test.done();
    });
};

exports.testStreamMethod = function(test) {
    test.expect(18);
    var nextExpected = 10;

    rpcClient.invoke("iter", [10, 20, 2], function(error, res, more) {
        test.ifError(error);

        if(nextExpected == 20) {
            test.equal(res, undefined);
            test.equal(more, false);
            test.done();
        } else {
            test.equal(res, nextExpected);
            test.equal(more, true);
            nextExpected += 2;
        }
    });
};

exports.testSimpleError = function(test) {
    test.expect(3);

    rpcClient.invoke("simpleError", [], function(error, res, more) {
        test.equal(error.message, "This is an error, man!");
        test.equal(res, null);
        test.equal(more, false);
        test.done();
    });
};

exports.testObjectError = function(test) {
    test.expect(3);

    rpcClient.invoke("objectError", [], function(error, res, more) {
        test.equal(error.message, "This is an error object, man!");
        test.equal(res, null);
        test.equal(more, false);
        test.done();
    });
};

exports.testStreamError = function(test) {
    test.expect(3);

    rpcClient.invoke("streamError", [], function(error, res, more) {
        test.equal(error.message, "This is a stream error, man!");
        test.equal(res, null);
        test.equal(more, false);
        test.done();
    });
};

exports.testClose = function(test) {
    test.expect(1);

    var closingClient = new client.Client();
    closingClient.connect("tcp://localhost:4242");

    var hit = false;

    closingClient.invoke("iter", [30, 40, 1], function(error, res, more) {
        if(hit) {
            throw new Error("iter() should not have been called more than once");
        } else {
            hit = true;
            test.ifError(error);
            closingClient.close();
            test.done();
        }
    });
};

exports.testNonExistentMethod = function(test) {
    test.expect(3);

    rpcClient.invoke("non_existent", [], function(error, res, more) {
        test.ok(error);
        test.equal(res, null);
        test.equal(more, false);
        test.done();
    });
};

exports.testQuiet = function(test) {
    test.expect(3);

    rpcClient.invoke("quiet", [], function(error, res, more) {
        test.equal(error.name, "TimeoutExpired");
        test.equal(res, null);
        test.equal(more, false);
        test.done();
    });
};

exports.testBadClient = function(test) {
    test.expect(3);

    badRpcClient.invoke("add42", [30], function(error, res, more) {
        test.ok(error);
        test.equal(res, null);
        test.equal(more, false);
        test.done();
    });
};