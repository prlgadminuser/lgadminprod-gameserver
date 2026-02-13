


const playerhitbox = {
  xMin: 13,
  xMax: 13,
  yMin: 43,
  yMax: 44,
  width: 22,
  height: 47,
  zonewidth: 35,
  zoneheight: 57,
}

const validDirections = new Set([-90, 0, 180, -180, 90, 45, 135, -135, -45]);
const isValidDirection = (direction) => validDirections.has(direction);

module.exports = { 
  playerhitbox,
  isValidDirection,
}