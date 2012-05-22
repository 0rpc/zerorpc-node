var server = require("../src/server");
var rpc = new server.Server();

rpc.connect("tcp://0.0.0.0:4242");

rpc.on("error", function(error) {
    console.error("$%*((", error);
})

rpc.expose({
    addMan: function(cb, sentence) {
        cb(null, sentence + ", man!");
    },

    add42: function(cb, n) {
        cb(null, n + 42);
    },

    boat: function(cb, sentence) {
        cb(null, "I'm on a boat!", false);
    },

    iter: function(cb, from, to, step) {
        for(i=from; i<to; i+=step) {
            cb(null, i, true);
        }

        cb(null, undefined, false);
    }
});