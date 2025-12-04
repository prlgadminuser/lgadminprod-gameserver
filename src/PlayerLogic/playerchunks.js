
const viewmultiplier = 1;
const xThreshold = 420 * viewmultiplier;
const yThreshold = 240 * viewmultiplier;

function getPlayersInRange(room, centerX, centerY) {

  const xMin = centerX - xThreshold;
  const xMax = centerX + xThreshold;
  const yMin = centerY - yThreshold;
  const yMax = centerY + yThreshold;

 const nearbyPlayers = room.grid.getObjectsInArea(xMin, xMax, yMin, yMax, "player", false);

  return nearbyPlayers;
}

module.exports = {
  getPlayersInRange
};
