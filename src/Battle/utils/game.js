

const validDirections = [-90, 0, 180, -180, 90, 45, 135, -135, -45];

const isValidDirection = (direction) => {
  const numericDirection = parseFloat(direction);
  return !isNaN(numericDirection) && validDirections.includes(numericDirection);
};

function encodePosition(num) {
  return Math.round(num * 100); // keep 2 decimals
  // Math.floor(p.x * 10)
}


module.exports = { validDirections, isValidDirection, encodePosition}
