
const validDirections = new Set([-90, 0, 180, -180, 90, 45, 135, -135, -45]);
const isValidDirection = (direction) => validDirections.has(direction);

module.exports = { 
  isValidDirection,
}