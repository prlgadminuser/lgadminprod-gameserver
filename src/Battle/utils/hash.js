

function generateHash(message) {
  return JSON.stringify(message);
}

function arraysEqual(a, b) {
  return a.join() === b.join();
}

function deepCopy(obj) {
  return JSON.parse(JSON.stringify(obj));
}

module.exports = { generateHash, arraysEqual, deepCopy };
