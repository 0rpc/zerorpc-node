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

var util = require("./util");

var HEARTBEAT = 5000;

//Adds a timeout on a channel - if a response isn't received within a certain
//amount of time, we execute the callback with a timeout error.
function addTimeout(timeout, channel, callback) {
    var runner = setTimeout(function() {
        var error = util.createErrorResponse("TimeoutExpired", "Timeout after " + timeout + "ms");
        callback(error);
        channel.close();
    }, timeout);

    //Clear the timeout when the channel is closed
    channel.on("closing", function() {
        clearTimeout(runner);
    });
}

//Adds a heartbeat on a channel - if a heartbeat response isn't received in a
//reasonable amount of time, we execute the callback with a heartbeat error.
function addHeartbeat(channel, callback) {
    var nextExpirationTime = function() {
        return util.curTime() + HEARTBEAT * 2;
    }

    var expirationTime = nextExpirationTime();

    var runner = setInterval(function() {
        if(util.curTime() > expirationTime) {
            //If we haven't received a response in 2 * heartbeat rate, send an
            //error
            var error = util.createErrorResponse("LostRemote", "Lost remote after " + HEARTBEAT + "ms heartbeat (waited twice as long)");
            callback(error);
            channel.close();
        } else {
            //Heartbeat on the channel
            channel.send("_zpc_hb", [0]);
        }
    }, HEARTBEAT);

    channel.register(function(event, next) {
        if(event.name == "_zpc_hb") {
            expirationTime = nextExpirationTime();
        } else {
            next();
        }
    });

    ///Clear the heartbeat when the channel is closed
    channel.on("closing", function() {
        clearTimeout(runner);
    });
}

exports.addTimeout = addTimeout;
exports.addHeartbeat = addHeartbeat;