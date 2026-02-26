const { getPlayersInRange } = require("../utils/game");

const animationtypes = {
  eliminated: 1,
  respawning: 2,
};

function spawnAnimation(room, player, type) {
  if (!player) return; // Ensure the player exists

  const animationtype = animationtypes[type];
  const x = Math.round(player.position.x);
  const y = Math.round(player.position.y);

  const newAnimation = [animationtype, x, y];
  // currently not touching grid cause we would need to put animations in player.updateView which would use more capacity

  const viewmultiplier = 1;
  const centerX = x
  const centerY = y
  const xThreshold = 420 * viewmultiplier;
  const yThreshold = 240 * viewmultiplier;

  const xMin = centerX - xThreshold;
  const xMax = centerX + xThreshold;
  const yMin = centerY - yThreshold;
  const yMax = centerY + yThreshold;

  let playersInRange = []


  for (const player of room.connectedPlayers) {
    
   const { x, y } = player.position

  const isNearby  = x >= xMin && x <= xMax && y >= yMin && y <= yMax

  if (isNearby) playersInRange.push (player)

  };


  for (const p of playersInRange) {
    p.nearbyanimations.push(newAnimation);
  }
}

module.exports = {
  spawnAnimation,
};
