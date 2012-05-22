var client = require("../src/client");

var rpc = new client.Client();

rpc.connect("tcp://localhost:4242");

rpc.on("error", function(error) {
    console.error("> ERROR:", error);
});

function invoke(name, args, callback) {
    rpc.invoke(name, args, function(error, res) {
        if(error) console.error("> REQUEST ERROR:", error);
        if(res !== undefined) callback(res);
    });
}

function methods(callback) {
    invoke("_zerorpc_inspect", [], function(res) {
        var methods = res[0].methods;

        for(var i=0; i<methods.length; i++) {
            callback(methods[i]);
        }
    });
}

function call(name, args) {
    invoke(name, args, function(res) {
        console.log(">", res);
    });
}

function inspect() {
    methods(function(method) {
        var args = method[1][0].slice(1).join(", ");
        console.log(">", method[0], "(" + args + ")");
        if(method[2]) console.log("      ", method[2]);
    });
}

var repl = require("repl").start("", null, null, false, true);
repl.context._rpc = rpc;
repl.context._inspect = inspect;

methods(function(method) {
    repl.context[method[0]] = function() {
        var args = Array.prototype.slice.call(arguments);

        invoke(method[0], args, function(res) {
            console.log(">", res);
        });
    };
});
