

function getDistance(x1, y1, x2, y2) {
  return Math.sqrt(Math.pow(x1 - x2, 2) + Math.pow(y1 - y2, 2));
}

const validDirections = [-90, 0, 180, -180, 90, 45, 135, -135, -45];

const isValidDirection = (direction) => {
  const numericDirection = parseFloat(direction);
  return !isNaN(numericDirection) && validDirections.includes(numericDirection);
};

function encodePosition(num) {
  return Math.round(num * 10); // keep 2 decimals
  // Math.floor(p.x * 10)
}

module.exports = { getDistance, validDirections, isValidDirection, encodePosition}