"use strict";


// Function to handle spectating logic for eliminated players
function handleSpectatorMode(player, room) {
  if (!player.eliminated) {
    // No longer eliminated: stop spectating
    player.spectating = false;
    player.spectatingTarget = null;
    player.lastSpectateSwitch = null;
    return;
  }

  // Immediately enable spectating if not already
  if (!player.spectating) {
    player.spectating = true;
    player.lastSpectateSwitch = Date.now();
  }

  const now = Date.now();
  const currentTarget = player.spectatingTarget;

  // Always update view if there is a target
  if (currentTarget) {
    updateSpectatingPlayer(player, currentTarget);
  }

  // Only switch target if cooldown passed OR no target
  if (!currentTarget || now - player.lastSpectateSwitch >= 2000 || currentTarget.eliminated) {
    const nearestNonEliminated = findNearestPlayer(
      player,
      Array.from(room.players.values()).filter(p => !p.eliminated && p !== player)
    );

    if (nearestNonEliminated) {
      player.spectatingTarget = nearestNonEliminated;
      player.lastSpectateSwitch = now;
      updateSpectatingPlayer(player, nearestNonEliminated);
    }
  }
}


function updateSpectatingPlayer(spectatingPlayer, targetPlayer) {
//  console.log(targetPlayer)
  if (!targetPlayer) return
  spectatingPlayer.x = targetPlayer.x
  spectatingPlayer.y = targetPlayer.y
  spectatingPlayer.nearbyfinalids = targetPlayer.nearbyfinalids
  //if (!spectatingPlayer.nearbyfinalids.has(targetPlayer.nmb)) spectatingPlayer.nearbyfinalids.add(targetPlayer.nmb);
  spectatingPlayer.hitmarkers = targetPlayer.hitmarkers
  spectatingPlayer.nearbycircles = targetPlayer.nearbycircles
  spectatingPlayer.nearbyanimations = targetPlayer.nearbyanimations
  spectatingPlayer.finalbullets = targetPlayer.finalbullets
  spectatingPlayer.pd = targetPlayer.pd;

  spectatingPlayer.spectatingPlayerId = targetPlayer.nmb
  spectatingPlayer.spectatingTarget = targetPlayer
}

function findNearestPlayer(eliminatedPlayer, players) {
  let nearestPlayer = null;
  let shortestDistance = Infinity;

  players.forEach((player) => {
    const distance = Math.sqrt(
      Math.pow(player.x - eliminatedPlayer.x, 2) +
        Math.pow(player.y - eliminatedPlayer.y, 2)
    );

    if (distance < shortestDistance) {
      shortestDistance = distance;
      nearestPlayer = player;
    }
  });

  return nearestPlayer;
}

function startSpectatingLogic(player, room) {
  player.spectating = true;
}

module.exports = {
  startSpectatingLogic,
  handleSpectatorMode,
};
