"use strict";

const { TeamPlayersActive } = require("@main/src/teamhandler/aliveteam");
const { addEntryToKillfeed } = require("./killfeed");
const { playerhitbox } = require("../config/player");


const RandomZone = true

const PLAYER_WIDTH = playerhitbox.zonewidth
const PLAYER_HEIGHT = playerhitbox.zoneheight

function isWithinZone(room, playerX, playerY) {
  return playerX - PLAYER_WIDTH >= room.zoneStartX && playerX + PLAYER_WIDTH <= room.zoneEndX &&
    playerY - PLAYER_HEIGHT >= room.zoneStartY && playerY + PLAYER_HEIGHT <= room.zoneEndY;
}

function smoothZoneMovement(room) {
  const phase = room.zonephases[room.currentPhase];
  if (!phase) return;

  const { waitTime, shrinkTime, targetX, targetY, targetSize } = phase;
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
    Math.round(room.zoneStartY) ,
    Math.round(room.zoneEndX),
    Math.round(room.zoneEndY),
  ]

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
           player.eliminate();

            addEntryToKillfeed(room, 3, null, player.id, null);
          } else {
            player.respawn()
            addEntryToKillfeed(room, 4, null, player.id, null);
          }
        }
      }
    }
  });
}


function generateRandomTarget(prevZone, targetSize) {
  if (RandomZone) {
    const { zoneStartX, zoneStartY, zoneEndX, zoneEndY } = prevZone;

    const maxCenterX = zoneEndX - targetSize / 2;
    const minCenterX = zoneStartX + targetSize / 2;
    const maxCenterY = zoneEndY - targetSize / 2;
    const minCenterY = zoneStartY + targetSize / 2;

    const targetX = Math.random() * (maxCenterX - minCenterX) + minCenterX;
    const targetY = Math.random() * (maxCenterY - minCenterY) + minCenterY;

    return { targetX, targetY };
  } else {
    return { targetX: 0, targetY: 0 };
  }
}


 

function UseZone(room) {
  room.zoneStartX -= room.mapWidth / 2;
  room.zoneStartY -= room.mapHeight / 2;
  room.zoneEndX += room.mapWidth / 2;
  room.zoneEndY += room.mapHeight / 2;

  const baseZone = {
    zoneStartX: room.zoneStartX,
    zoneStartY: room.zoneStartY,
    zoneEndX: room.zoneEndX,
    zoneEndY: room.zoneEndY
  };

  const phases = [];

  const zones = [
    { targetSize: room.mapHeight * 2, waitTime: 0, shrinkTime: 24000, damage: 2 },
    { targetSize: room.mapHeight * 1.3, waitTime: 20000, shrinkTime: 50000, damage: 5 },
    { targetSize: room.mapHeight * 0.6, waitTime: 20000, shrinkTime: 50000, damage: 8 },
    { targetSize: room.mapHeight * 0.4, waitTime: 20000, shrinkTime: 50000, damage: 8 },
    { targetSize: room.mapHeight * 0.2, waitTime: 20000, shrinkTime: 50000, damage: 8 },
    { targetSize: room.mapHeight * 0.1, waitTime: 20000, shrinkTime: 50000, damage: 8 },
    { targetSize: 0, waitTime: 20000, shrinkTime: 50000, damage: 10 }
  ];

  let prevZone = baseZone;

  for (let i = 0; i < zones.length; i++) {
    const { targetSize, waitTime, shrinkTime, damage } = zones[i];
    const { targetX, targetY } = generateRandomTarget(prevZone, targetSize);

    const phase = {
      waitTime,
      shrinkTime,
      damagePerSecond: damage,
      zonespeed: 5,
      targetX,
      targetY,
      targetSize,
    };

    phases.push(phase);

    // Calculate new zone boundaries for the next phase
    prevZone = {
      zoneStartX: targetX - targetSize / 2,
      zoneStartY: targetY - targetSize / 2,
      zoneEndX: targetX + targetSize / 2,
      zoneEndY: targetY + targetSize / 2
    };
  }

  room.zonephases = phases;
  room.currentPhase = 0;
  room.phaseStartTime = new Date().getTime(),

  room.shrinkInterval = room.setRoomInterval(() => smoothZoneMovement(room), 33);
  room.damageInterval = room.setRoomInterval(() => dealDamage(room), 1000);
}

module.exports = {
  UseZone,

}

