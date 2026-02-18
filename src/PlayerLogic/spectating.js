
"use strict";

const timeToSwitchTargets = 2000

function handleSpectatorMode(player, room) {
  if (!player.eliminated) {
    // No longer eliminated: stop spectating
    player.spectating = false;
    player.spectatingTarget = null;
    player.lastSpectateSwitch = null;
    player.pendingSwitchAt = null;
    return;
  }


  // Immediately enable spectating if not already
  if (!player.spectating) {
    player.spectating = true;
  }

  const now = Date.now();
  const currentTarget = player.spectatingTarget;

   if (currentTarget) {
    updateSpectatingPlayer(player, currentTarget);
  }


  // If current target just got eliminated → start a new 2s countdown
  if (currentTarget && currentTarget.eliminated && !player.pendingSwitchAt) {
    player.pendingSwitchAt = now + timeToSwitchTargets; // wait exactly 2s
  }

  // Check if it's time to switch
  if (!currentTarget || (player.pendingSwitchAt && now >= player.pendingSwitchAt)) {
    const nearestNonEliminated = findNearestPlayer(
      player,
      room.alivePlayers,
    );

    if (nearestNonEliminated) {
      player.spectatingTarget = nearestNonEliminated;
      player.spectatingPlayerId = nearestNonEliminated.id
      player.lastSpectateSwitch = now;
      player.pendingSwitchAt = null; // reset
    //  player.tick_send_allow = true
     updateSpectatingPlayer(player, nearestNonEliminated);
      
    }
  }
}

function findNearestPlayer(eliminatedPlayer, players) {
  let nearestPlayer = null;
  let shortestDistance = Infinity;

 for (const player of players) {
    const distance = Math.sqrt(
      Math.pow(player.x - eliminatedPlayer.x, 2) +
      Math.pow(player.y - eliminatedPlayer.y, 2)
    );

    if (distance < shortestDistance) {
      shortestDistance = distance;
      nearestPlayer = player;
    }
  };

  return nearestPlayer;
}

function updateSpectatingPlayer(spcPlayer, target) {
  if (!target) return;
  spcPlayer.spectatingTarget = target;
  spcPlayer.spectatingPlayerId = target.id
  spcPlayer.x = target.x;
  spcPlayer.y = target.y;
  spcPlayer.pd = target.latestnozeropd;
}

function startSpectatingLogic(player) {
  player.spectating = true;
}

module.exports = {
  startSpectatingLogic,
  handleSpectatorMode,
};
