
module.exports = {

generateHash(message) {
  return JSON.stringify(message);
},

arraysEqual(a, b) {
  return a.join() === b.join();
},

deepCopy(obj) {
  return JSON.parse(JSON.stringify(obj));
},

generateUUID() {
  return "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8; // Ensures UUID version 4
    return v.toString(16);
  });
}

};
