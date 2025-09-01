

const msgpack = require("msgpack-lite");

function compressMessage(msg) {
  return msgpack.encode(msg);
}

module.exports = { compressMessage }
