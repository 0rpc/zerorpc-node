var etc = require("./etc");

function addTimeout(timeout, channel, callback) {
    var runner = setTimeout(function() {
        var error = etc.createErrorResponse("TimeoutExpired", "Timeout after " + timeout + "ms");
        callback(error);
        channel.close();
    }, timeout);

    channel.on("close", function() {
        clearTimeout(runner);
    });
}

function addHeartbeat(heartbeat, channel, callback) {
    var nextExpirationTime = function() {
        return etc.curTime() + heartbeat * 2;
    }

    var expirationTime = nextExpirationTime();

    var runner = setInterval(function() {
        if(etc.curTime() > expirationTime) {
            var error = etc.createErrorResponse("LostRemote", "Lost remote after " + heartbeat + "ms heartbeat (waited twice as long)");
            callback(error);
            channel.close();
        } else {
            channel.send("_zpc_hb", [0]);
        }
    }, heartbeat);

    channel.register(function(event, next) {
        if(event.name == "_zpc_hb") {
            expirationTime = nextExpirationTime();
        } else {
            next();
        }
    });

    channel.on("close", function() {
        clearTimeout(runner);
    });
}

exports.addTimeout = addTimeout;
exports.addHeartbeat = addHeartbeat;