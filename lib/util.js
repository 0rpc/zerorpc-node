// Open Source Initiative OSI - The MIT License (MIT):Licensing
//
// The MIT License (MIT)
// Copyright (c) 2015 François-Xavier Bourlet (bombela+zerorpc@gmail.com)
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

//Proxies event from one object to another
//from : EventEmitter
//      The object to proxy events from
//to : EventEmitter
//      The object to proxy events to
function eventProxy(from, to, name) {
    from.on(name, function() {
        var args = Array.prototype.slice.call(arguments);
        args.unshift(name);
        to.emit.apply(to, args);
    });
}

//Gets the current time in milliseconds since epoch
//return : Number
function curTime() {
    return Date.now();
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
function createErrorResponse(name, message, stack) {
	var e = Error(message);
	e.name = name;
	if (stack !== undefined) {
		e.stack = stack;
	}
	return e;
}

exports.eventProxy = eventProxy;
exports.curTime = curTime;
exports.createErrorResponse = createErrorResponse;
