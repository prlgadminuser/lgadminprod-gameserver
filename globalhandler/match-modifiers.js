"use strict";

const { respawnplayer } = require("./../playerhandler/respawn");
const { handleElimination } = require("./../playerhandler/eliminated.js");
const { TeamPlayersActive } = require('./../teamhandler/aliveteam')


// Helper function to decrease health
function applyHealthDecrease(player, room) {
  if (player.health > 0) {
    player.last_hit_time = new Date().getTime();
    player.health -= 5;

    if (player.health <= 0) {
      const teamactiveplayers = TeamPlayersActive(room, player)
      if (player.respawns > 0 || teamactiveplayers > 1) {
        respawnplayer(room, player);
      } else {
        handleElimination(room, player.team.players);
      }
    }
  }
}

// Helper function to regenerate health
function applyHealthRegeneration(player, currentTime) {
  if (
    player.health > 0 &&
    player.health < player.starthealth &&
    currentTime - player.last_hit_time >= 10000
  ) {
    player.health = Math.min(player.health + 6, player.starthealth);
  }
}

// Function to decrease health for all players
function decreaseHealthForAllPlayers(room) {
  if (room.state === "playing" && room.winner === -1) {
    room.players.forEach((player) => {
      if (player.visible !== false) {
        applyHealthDecrease(player, room);
      }
    });
  }
}

// Function to regenerate health for all players
function regenerateHealthForAllPlayers(room) {
  if (room.state === "playing") {
    const currentTime = new Date().getTime();

    room.players.forEach((player) => {
      if (player.visible !== false) {
        applyHealthRegeneration(player, currentTime);
      }
    });
  }
}

// Start periodic health decrease
function startDecreasingHealth(room, intervalInSeconds) {
  room.intervalIds.push(setInterval(() => {

    decreaseHealthForAllPlayers(room);
    
  }, intervalInSeconds * 1000));
}

// Start periodic health regeneration
function startRegeneratingHealth(room, intervalInSeconds) {
  room.intervalIds.push(setInterval(() => {

    regenerateHealthForAllPlayers(room);

  }, intervalInSeconds * 1000));
}

module.exports = {
  startDecreasingHealth,
  startRegeneratingHealth,
};
