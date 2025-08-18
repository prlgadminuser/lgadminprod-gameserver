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

  // Always update view if there is a target (even if eliminated)
  if (currentTarget) {
    updateSpectatingPlayer(player, currentTarget);
  }

  // Decide if we should switch
  // - no target at all
  // - OR cooldown passed (2s), even if target was eliminated
  if (!currentTarget || now - (player.lastSpectateSwitch || 0) >= 2000) {
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
  if (!targetPlayer) return;
  spectatingPlayer.x = targetPlayer.x;
  spectatingPlayer.y = targetPlayer.y;
  spectatingPlayer.nearbyfinalids = targetPlayer.nearbyfinalids;
  spectatingPlayer.hitmarkers = targetPlayer.hitmarkers;
  spectatingPlayer.nearbycircles = targetPlayer.nearbycircles;
  spectatingPlayer.nearbyanimations = targetPlayer.nearbyanimations;
  spectatingPlayer.finalbullets = targetPlayer.finalbullets;
  spectatingPlayer.pd = targetPlayer.pd;

  spectatingPlayer.spectatingPlayerId = targetPlayer.nmb;
  spectatingPlayer.spectatingTarget = targetPlayer;
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
