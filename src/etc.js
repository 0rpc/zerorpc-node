//Proxies event from one object to another
//from : EventEmitter
//      The object to proxy events from
//to : EventEmitter
//      The object to proxy events to
function eventProxy(from, to, name) {
    from.on(name, function() {
        var args = Array.prototype.slice.call(arguments);
        args.shift(name);
        to.emit.apply(to, args);
    });
}

//Gets the current time in milliseconds since epoch
//return : Number
function curTime() {
    return new Date().getTime();
}

//Creates an error object
//name : String
//      The error name
//message : String
//      The error message
//traceback : String
//      The exception stack trace as a string
//return : Object
//      An error object
function createErrorResponse(name, message, traceback) {
    return { name: name, message: message, traceback: traceback };
}

exports.eventProxy = eventProxy;
exports.curTime = curTime;
exports.createErrorResponse = createErrorResponse;