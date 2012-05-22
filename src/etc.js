function eventProxy(from, to, name) {
    from.on(name, function() {
        var args = Array.prototype.slice.call(arguments);
        args.shift(name);
        to.emit.apply(to, args);
    });
}

function curTime() {
    return new Date().getTime();
}

function createErrorResponse(name, message, traceback) {
    return { name: name, message: message, traceback: traceback };
}

exports.eventProxy = eventProxy;
exports.curTime = curTime;
exports.createErrorResponse = createErrorResponse;