"use strict";

const { server_tick_rate } = require("../globalhandler/config");

// Function to handle spectating logic for eliminated players
function handleSpectatorMode(player, room) {
  // Only start spectating logic if the player is eliminated
  if (player.eliminated) {
    const now = Date.now();
    if (player.spectatingTarget) {
      const currentTarget = room.players.get(player.spectatingTarget);
      if (currentTarget && !currentTarget.eliminated) {
        // Stick with the current target if it's valid
        updateSpectatingPlayer(player, currentTarget);
        return;
      } else {
        player.spectatingTarget = null;
        player.lastSpectateSwitch = now; 
      }
    }
    // Check if the cooldown period has passed before switching
    if (!player.lastSpectateSwitch || now - player.lastSpectateSwitch >= 2000) {
      // Find the next nearest non-eliminated player
      const nearestNonEliminatedPlayer = findNearestPlayer(
        player,
        Array.from(room.players.values()).filter(
          (p) => !p.eliminated && p !== player
        )
      );

      if (nearestNonEliminatedPlayer) {
        player.spectatingTarget = nearestNonEliminatedPlayer.playerId; // Set new target
        player.lastSpectateSwitch = now; // Reset cooldown timer

        updateSpectatingPlayer(player, nearestNonEliminatedPlayer);
      }
    }
  } else {
    // If the player is no longer eliminated, clear spectating state
    player.spectatingTarget = null;
    player.lastSpectateSwitch = null; // Reset cooldown timer
  }
}


function updateSpectatingPlayer(spectatingPlayer, targetPlayer) {
  spectatingPlayer.x = targetPlayer.x;
  spectatingPlayer.y = targetPlayer.y;
  spectatingPlayer.spectateid = targetPlayer.nmb;
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
