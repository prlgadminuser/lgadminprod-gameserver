const { getPlayersInRange } = require("../Battle/PlayerLogic/playerchunks");


  const animationtypes = {
  eliminated: 1,
  respawning: 2,
};

function spawnAnimation(room, player, type) {
  if (!player) return; // Ensure the player exists


  const animationtype = animationtypes[type]
  const x = Math.round(player.x)
  const y = Math.round(player.y)

  const newAnimation = [
    animationtype,
    x,
    y,
  ]

  const playersToSend = getPlayersInRange(room, player.x, player.y)


  for (const p of playersToSend) {
  p.nearbyanimations.push(newAnimation)
  }

}



module.exports = {
  spawnAnimation,
};
