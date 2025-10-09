
const msgpack = require("msgpack-lite");

module.exports = {
  compressMessage(msg) {
    return msgpack.encode(msg);
  },
};
