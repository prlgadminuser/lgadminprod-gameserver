
function generateHash(message) {
  return JSON.stringify(message)
}

function arraysEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// Simple string-to-number hash
function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return h;
}


function deepCopy(obj) {
  return JSON.parse(JSON.stringify(obj));
}

module.exports = {generateHash, arraysEqual, hashString, deepCopy}
