const protobuf = require("protobufjfs");

// Define the schema
const protoSchema = `
syntax = "proto3";

message Root {
  SD sd = 1;
}

message SD {
  sint32 id = 1;
  sint32 state = 2;
  sint32 h = 3;
  sint32 sh = 4;
  sint32 s = 5;
  string g = 6;
  sint32 kil = 7;
  sint32 dmg = 8;
  string rwds = 9;
  sint32 cg = 10;
  sint32 lg = 11;
  sint32 x = 12;
  sint32 y = 13;
  sint32 em = 14;
  sint32 spc = 15;
  string guns = 16;
  string np = 17;
}
`;

console.log(protoSchema);

// Parse the schema
const root = protobuf.parse(protoSchema).root;
const RootMessage = root.lookupType("Root");

// Your input data matching the Root schema
const data = {
  "sd": {
    "id": 0,
    "state": 106,
    "h": 570,
    "sh": 50,
    "s": 0,
    "g": "4",
    "kil": 0,
    "dmg": 0,
    "rwds": "$$",
    "cg": 1,
    "lg": 3,
    "x": 0,
    "y": 0,
    "em": 0,
    "spc": 0,
    "guns": "4$2$3",
    "np": "[]"
  }
};

// Verify the payload (optional)
const errMsg = RootMessage.verify(data);
if (errMsg) throw Error(errMsg);

// Create the message
const message = RootMessage.create(data);

// Encode the message to a buffer
const buffer = RootMessage.encode(message).finish();
console.log("Encoded Protobuf (Buffer):", buffer);

// Decode the message from buffer
const decoded = RootMessage.decode(buffer);

// Convert back to a plain object
const decodedObject = RootMessage.toObject(decoded, { defaults: true });

// Check if the decoded data matches the original
const isMatch = JSON.stringify(data) === JSON.stringify(decodedObject);
console.log("Does the decoded data match the original?", isMatch ? "✅ Yes" : "❌ No");

// Output in Hex
const hex = buffer.toString('hex');
console.log("Protobuf Hex (buffer):", hex);

// Grouped hex format (optional)
const groupedHex = hex.match(/.{1,2}/g).join(' ');
console.log("Grouped Hex for previous code:", groupedHex);

// Base64 encoding
const base64 = Buffer.from(buffer).toString('base64');
console.log("Base64 Encoded:", base64);
