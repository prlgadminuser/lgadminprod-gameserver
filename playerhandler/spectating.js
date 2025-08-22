
"use strict";


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

  // Always update view if there is a target (even if eliminated)
  if (currentTarget) {
    updateSpectatingPlayer(player, currentTarget);
  }

  // If current target just got eliminated → start a new 2s countdown
  if (currentTarget && currentTarget.eliminated && !player.pendingSwitchAt) {
    player.pendingSwitchAt = now + 2000; // wait exactly 2s
  }

  // Check if it's time to switch
  if (!currentTarget || (player.pendingSwitchAt && now >= player.pendingSwitchAt)) {
    const nearestNonEliminated = findNearestPlayer(
      player,
      Array.from(room.players.values()).filter(p => p.alive && p !== player)
    );

    if (nearestNonEliminated) {
      player.spectatingTarget = nearestNonEliminated;
      player.lastSpectateSwitch = now;
      player.pendingSwitchAt = null; // reset
    //  player.tick_send_allow = true
      updateSpectatingPlayer(player, nearestNonEliminated);
      
    }
  }
}

function updateSpectatingPlayer(spectatingPlayer, targetPlayer) {
  if (!targetPlayer) return;
//  spectatingPlayer.x = targetPlayer.x;
 // spectatingPlayer.y = targetPlayer.y;
  spectatingPlayer.spectatingPlayerId = targetPlayer.id;
  spectatingPlayer.spectatingTarget = targetPlayer;
  spectatingPlayer.pd = targetPlayer.latestnozeropd;
  spectatingPlayer.nearbyplayersids = targetPlayer.nearbyplayersids;
  spectatingPlayer.hitmarkers = targetPlayer.hitmarkers;
  spectatingPlayer.nearbycircles = targetPlayer.nearbycircles;
  spectatingPlayer.nearbyanimations = targetPlayer.nearbyanimations;
  spectatingPlayer.finalbullets = targetPlayer.finalbullets;
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

function startSpectatingLogic(player) {
  player.spectating = true;
}

module.exports = {
  startSpectatingLogic,
  handleSpectatorMode,
};
