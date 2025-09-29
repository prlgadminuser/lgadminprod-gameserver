


const playerhitbox = {
  xMin: 14,
  xMax: 14,
  yMin: 49,
  yMax: 49,
  width: 22,
  height: 47,
  zonewidth: 40,
  zoneheight: 60,
}

const validDirections = new Set([-90, 0, 180, -180, 90, 45, 135, -135, -45]);
const isValidDirection = (direction) => validDirections.has(direction);

module.exports = { 
  playerhitbox,
  isValidDirection,
}