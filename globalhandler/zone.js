"use strict";

const { respawnplayer } = require('./../playerhandler/respawn');
const { handleElimination } = require('./../playerhandler/eliminated.js');
const { addKillToKillfeed } = require('./killfeed.js');
const { TeamPlayersActive } = require('./../teamhandler/aliveteam');

const PLAYER_WIDTH = 40;
const PLAYER_HEIGHT = 60;

function isWithinZone(room, playerX, playerY) {
  return playerX - PLAYER_WIDTH >= room.zoneStartX && playerX + PLAYER_WIDTH <= room.zoneEndX &&
    playerY - PLAYER_HEIGHT >= room.zoneStartY && playerY + PLAYER_HEIGHT <= room.zoneEndY;
}

function smoothZoneMovement(room) {
  const phase = room.zonephases[room.currentPhase];
  if (!phase) return;

  const { waitTime, shrinkTime, targetX, targetY, targetSize, zonespeed } = phase;
  const elapsedTime = new Date().getTime() - room.phaseStartTime;

  // Handle phase transition cooldown, but only after zone has reached the target
  if (elapsedTime < waitTime) return; // Wait until the 'waitTime' has passed

  const adjustedElapsedTime = elapsedTime - waitTime; // Remove 'waitTime' from elapsed time

  // Calculate current width and height of the zone
 
    // Otherwise, calculate progress based on elapsed time and shrink rate
  const progress = Math.min(adjustedElapsedTime / shrinkTime / 100, 1);
  

    // If not yet at target size, interpolate between the current size and target size
    const initialCenterX = (room.zoneStartX + room.zoneEndX) / 2;
    const initialCenterY = (room.zoneStartY + room.zoneEndY) / 2;
    const initialWidth = room.zoneEndX - room.zoneStartX;
    const initialHeight = room.zoneEndY - room.zoneStartY;


    const newCenterX = initialCenterX + progress * (targetX - initialCenterX);
    const newCenterY = initialCenterY + progress * (targetY - initialCenterY);
    const newWidth = initialWidth + progress * (targetSize - initialWidth);
    const newHeight = initialHeight + progress * (targetSize - initialHeight);

    room.zoneStartX = newCenterX - newWidth / 2;
    room.zoneEndX = newCenterX + newWidth / 2;
    room.zoneStartY = newCenterY - newHeight / 2;
    room.zoneEndY = newCenterY + newHeight / 2;

  const zonedata = [
    Math.round(room.zoneStartX),
    Math.round(room.zoneStartY),
    Math.round(room.zoneEndX),
    Math.round(room.zoneEndY),
  ].join('$');

  room.zone = zonedata;
 // For debugging the progress


 let zoneStartX = Math.round(room.zoneStartX);
 let zoneStartY = Math.round(room.zoneStartY);
 let zoneEndX = Math.round(room.zoneEndX);
 let zoneEndY = Math.round(room.zoneEndY);
 
 // Calculate width and height of the zone
 let width = zoneEndX - zoneStartX;
 let height = zoneEndY - zoneStartY;
 
 
  // When the phase completes (i.e., target size is reached), transition to the next one
  if (width < targetSize + 10 && height < targetSize + 10 && room.currentPhase < room.zonephases.length - 1) {
    room.currentPhase++;
    room.phaseStartTime = new Date().getTime(); // Restart phase timer for the next phase
  }
}

function dealDamage(room) {
  const phase = room.zonephases[room.currentPhase];
  const damagePerSecond = phase ? phase.damagePerSecond : 1; // Default to 1 damage per second

  room.players.forEach((player) => {
    if (player.state === 1 && !isWithinZone(room, player.x, player.y)) {
      if (room.winner === -1) {
        player.health -= damagePerSecond;
        player.last_hit_time = new Date().getTime();
        if (player.health <= 0) {
          const teamActivePlayers = TeamPlayersActive(room, player);

          if (player.respawns <= 0 && teamActivePlayers <= 1) {
            handleElimination(room, player.team.players);
            addKillToKillfeed(room, 3, null, player.nmb, null);
          } else {
            respawnplayer(room, player);
            addKillToKillfeed(room, 4, null, player.nmb, null);
          }
        }
      }
    }
  });
}

function pingPlayers(room) {
  room.timeoutIds.push(
    setTimeout(() => {
      room.players.forEach((player) => {
        if (player.visible !== false) {
          player.lastping = new Date().getTime();
        }
      });
      room.sendping = 1;
    }, 200)
  );

  room.timeoutIds.push(
    setTimeout(() => {
      room.sendping = undefined;
    }, 500)
  );
}

const RandomZone = false

function generateRandomTarget(mapWidth, mapHeight) {
  if (RandomZone) {
    const randomX = Math.floor(Math.random() * (mapWidth * 2 + 1)) - mapWidth;
    const randomY = Math.floor(Math.random() * (mapHeight * 2 + 1)) - mapHeight;
    return { targetX: randomX, targetY: randomY };
  } else {
    return { targetX: 0, targetY: 0 };
  }
}

 

function UseZone(room) {
  room.zoneStartX -= room.mapWidth / 2;
  room.zoneStartY -= room.mapHeight / 2;
  room.zoneEndX += room.mapWidth / 2;
  room.zoneEndY += room.mapHeight / 2;

  const mapWidth = room.mapWidth * 0.7
  const mapHeight = room.mapHeight * 0.7

  room.zonephases = [
    { waitTime: 0, shrinkTime: 240000, damagePerSecond: 2, zonespeed: 5, ...generateRandomTarget(mapWidth, mapHeight), targetSize: room.mapHeight * 2 },
    { waitTime: 20000, shrinkTime: 50000, damagePerSecond: 4, zonespeed: 5, ...generateRandomTarget(mapWidth, mapHeight), targetSize: room.mapHeight * 1.3 },
    { waitTime: 20000, shrinkTime: 50000, damagePerSecond: 8, zonespeed: 5, ...generateRandomTarget(mapWidth, mapHeight), targetSize: room.mapHeight * 0.6 },
    { waitTime: 20000, shrinkTime: 50000, damagePerSecond: 12, zonespeed: 5, ...generateRandomTarget(mapWidth, mapHeight), targetSize: 0 },
  ];

  room.currentPhase = 0;
  room.phaseStartTime = new Date().getTime();

  room.shrinkInterval = room.intervalIds.push(
    setInterval(() => smoothZoneMovement(room), 33)
  );

  room.damageInterval = room.intervalIds.push(
    setInterval(() => dealDamage(room), 1000)
  );
}

module.exports = {
  UseZone,
};