"use strict";

const { server_tick_rate } = require("../globalhandler/config");

// Function to handle spectating logic for eliminated players
function handleSpectatorMode(player, room) {
    // Only start spectating logic if the player is eliminated
    if (player.eliminated) {
      const now = Date.now();
  
      // If player already has a spectating target, validate it
      if (player.spectatingTarget) {
        const currentTarget = room.players.get(player.spectatingTarget);
        if (currentTarget && !currentTarget.eliminated) {
          // Stick with the current target if it's valid
          updateSpectatingPlayer(player, currentTarget);
          return;
        } else {
          // Clear the invalid target and set cooldown start time
          player.spectatingTarget = null;
          player.lastSpectateSwitch = now; // Start cooldown
        }
      }
  
      // Check if the cooldown period has passed before switching
      if (!player.lastSpectateSwitch || now - player.lastSpectateSwitch >= 2000) {
        // Find the next nearest non-eliminated player
        const nearestNonEliminatedPlayer = findNearestPlayer(
          player,
          Array.from(room.players.values()).filter(p => !p.eliminated && p !== player)
        );

      //  console.log(nearestNonEliminatedPlayer)
  
        if (nearestNonEliminatedPlayer) {
          player.spectatingTarget = nearestNonEliminatedPlayer.playerId;// Set new target
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
  
  // Helper function to update the spectating player's position
  function updateSpectatingPlayer(spectatingPlayer, targetPlayer) {
    spectatingPlayer.x = targetPlayer.x;
    spectatingPlayer.y = targetPlayer.y;
   // spectatingPlayer.direction2 = targetPlayer.direction2;
    spectatingPlayer.spectateid = targetPlayer.nmb;
  }
  
  // Function to find the nearest non-eliminated player
  function findNearestPlayer(eliminatedPlayer, players) {
    let nearestPlayer = null;
    let shortestDistance = Infinity;
  
    players.forEach(player => {
      const distance = Math.sqrt(
        Math.pow(player.x - eliminatedPlayer.x, 2) + Math.pow(player.y - eliminatedPlayer.y, 2)
      );
  
      if (distance < shortestDistance) {
        shortestDistance = distance;
        nearestPlayer = player;
      }
    });
  
    return nearestPlayer;
  }
  
  // Function to monitor spectating logic continuously for a player
  function startSpectatingLogic(player, room) {
    player.spectating = true
  }
  

  
module.exports = {
    startSpectatingLogic,
    handleSpectatorMode
  };