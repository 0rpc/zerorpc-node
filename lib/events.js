var msgpack = require("msgpack2"),
    uuid = require("node-uuid");

//Serializes an event into an array of buffers that can be transmitted
//through ZeroMQ.
//event : Object
//      The event to serialize
//return : Array of Buffers
//      The message to transmit across ZeroMQ
function serialize(event) {
    var payload = [event.header, event.name, event.args];
    var message = [];

    if(event.envelope) {
        message = message.concat(event.envelope);
    }

    message.push(new Buffer(0));
    message.push(msgpack.pack(payload));
    return message;
}

//Deserializes an event into an object.
//envelope : Array of Buffer
//      The ZeroMQ envelope
//payload : Buffer
//      The buffer containing the ZeroRPC event
//return : Object
//      The deserialized object
function deserialize(envelope, payload) {
    var event = msgpack.unpack(arguments[arguments.length - 1]);

    if(!(event instanceof Array) || event.length != 3) {
        throw new Error("Expected array of size 3");
    } else if(!(event[0] instanceof Object) || !event[0].message_id) {
        throw new Error("Bad header");
    } else if(typeof(event[1]) != 'string') {
        throw new Error("Bad name");
    }

    return create(envelope, event[0], event[1], event[2]);
}

//Creates a new event
//envelope : Array of Buffers
//      The ZeroMQ envelope
//header : Object
//      The ZeroRPC header
//name : String
//      The ZeroRPC event name
//args : Array
//      The ZeroRPC event arguments
//return : Object
//      A ZeroRPC object
function create(envelope, header, name, args) {
    return {
        envelope: envelope,
        header: header,
        name: name,
        args: args
    };
}

var uuidBase = uuid.v4().substring(0, 24),
    uuidCounter = 0;

function fastUUID() {
    var counter = uuidCounter++;
    //Just in the case user sends over 281 trillion messages?
    if(uuidCounter > 0xFFFFFFFFFFFF) uuidCounter = 0;
    return uuidBase + ("000000000000" + counter.toString(16)).slice(-12);
}

exports.serialize = serialize;
exports.deserialize = deserialize;
exports.create = create;
exports.fastUUID = fastUUID;