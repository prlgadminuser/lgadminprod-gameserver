"use strict";

const { addEntryToKillfeed } = require("./killfeed");
const { playerhitbox } = require("../config/player");
const { TeamPlayersActive } = require("../teamhandler/aliveteam");

const RandomZone = true;

const PLAYER_WIDTH = playerhitbox.zonewidth;
const PLAYER_HEIGHT = playerhitbox.zoneheight;

/* =========================================================
   UTILITIES
========================================================= */

function now() {
  return Date.now();
}

function formatTime(ms) {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function isWithinZone(room, playerX, playerY) {
  return (
    playerX - PLAYER_WIDTH >= room.zoneStartX &&
    playerX + PLAYER_WIDTH <= room.zoneEndX &&
    playerY - PLAYER_HEIGHT >= room.zoneStartY &&
    playerY + PLAYER_HEIGHT <= room.zoneEndY
  );
}

/* =========================================================
   PHASE TIMING MODEL
========================================================= */

function getPhaseTiming(room) {
  const phase = room.zonephases[room.currentPhase];
  if (!phase) return null;

  const elapsed = now() - room.phaseStartTime;
  const totalTime = phase.waitTime + phase.shrinkTime;

  const remainingTotal = Math.max(totalTime - elapsed, 0);
  const remainingWait = Math.max(phase.waitTime - elapsed, 0);

  const state = elapsed < phase.waitTime ? "waiting" : "shrinking";

  const progress =
    state === "shrinking"
      ? Math.min((elapsed - phase.waitTime) / phase.shrinkTime, 1)
      : 0;

  return {
    state,
    remainingWait,
    remainingTotal,
    progress,
  };
}

/* =========================================================
   ZONE MOVEMENT
========================================================= */

function startPhase(room) {
  room.phaseStartTime = now();

  const centerX = (room.zoneStartX + room.zoneEndX) / 2;
  const centerY = (room.zoneStartY + room.zoneEndY) / 2;
  const width = room.zoneEndX - room.zoneStartX;
  const height = room.zoneEndY - room.zoneStartY;

  room.phaseInitial = {
    centerX,
    centerY,
    width,
    height,
  };
}

function smoothZoneMovement(room) {
  const phase = room.zonephases[room.currentPhase];
  if (!phase) return;

  const timing = getPhaseTiming(room);
  if (!timing) return;

  // Still waiting → no movement
  if (timing.state === "waiting") return;

  const { progress } = timing;

  const { centerX, centerY, width, height } = room.phaseInitial;

  const newCenterX =
    centerX + progress * (phase.targetX - centerX);
  const newCenterY =
    centerY + progress * (phase.targetY - centerY);

  const newWidth =
    width + progress * (phase.targetSize - width);
  const newHeight =
    height + progress * (phase.targetSize - height);

  room.zoneStartX = newCenterX - newWidth / 2;
  room.zoneEndX = newCenterX + newWidth / 2;
  room.zoneStartY = newCenterY - newHeight / 2;
  room.zoneEndY = newCenterY + newHeight / 2;

  room.zone = [
    Math.round(room.zoneStartX),
    Math.round(room.zoneStartY),
    Math.round(room.zoneEndX),
    Math.round(room.zoneEndY),
  ];

  // Phase finished → move to next
  if (progress >= 1 && room.currentPhase < room.zonephases.length - 1) {
    room.currentPhase++;
    startPhase(room);
  }
}

/* =========================================================
   DAMAGE SYSTEM
========================================================= */

function dealDamage(room) {
  const phase = room.zonephases[room.currentPhase];
  const damagePerSecond = phase ? phase.damagePerSecond : 1;

    if (room.winner !== -1) return;

  for (const player of room.alivePlayers) {
    if (isWithinZone(room, player.x, player.y)) return;

    player.health -= damagePerSecond;
    player.last_hit_time = now();

    if (player.health > 0) return;

    if (player.IsEliminationAllowed()) {
      player.eliminate();
      addEntryToKillfeed(room, 3, null, player.id, null);
    } else {
      player.respawn();
      addEntryToKillfeed(room, 4, null, player.id, null);
    }
  };
}

/* =========================================================
   TARGET GENERATION
========================================================= */

function generateRandomTarget(prevZone, targetSize, mapWidth, mapHeight, allowedDrift) {
  if (!RandomZone) return { targetX: 0, targetY: 0 };

  const { zoneStartX, zoneStartY, zoneEndX, zoneEndY } = prevZone;

    let minCenterX = zoneStartX + targetSize / 2;
  let maxCenterX = zoneEndX - targetSize / 2;
  let minCenterY = zoneStartY + targetSize / 2;
  let maxCenterY = zoneEndY - targetSize / 2;

  if (allowedDrift > 0) {
    // Allow zone to move outside previous bounds
    const driftAmountX = (zoneEndX - zoneStartX) * allowedDrift; // 40% drift
    const driftAmountY = (zoneEndY - zoneStartY) * allowedDrift;

    minCenterX -= driftAmountX;
    maxCenterX += driftAmountX;
    minCenterY -= driftAmountY;
    maxCenterY += driftAmountY;
  }

  // Clamp so zone always stays inside map
  const mapMinX = -mapWidth;
  const mapMaxX = mapWidth;
  const mapMinY = -mapHeight;
  const mapMaxY = mapHeight;

  minCenterX = Math.max(minCenterX, mapMinX + targetSize / 2);
  maxCenterX = Math.min(maxCenterX, mapMaxX - targetSize / 2);
  minCenterY = Math.max(minCenterY, mapMinY + targetSize / 2);
  maxCenterY = Math.min(maxCenterY, mapMaxY - targetSize / 2);

  const targetX =
    Math.random() * (maxCenterX - minCenterX) + minCenterX;

  const targetY =
    Math.random() * (maxCenterY - minCenterY) + minCenterY;

  return { targetX, targetY };
}

/* =========================================================
   MAIN ENTRY
========================================================= */

function UseZone(room) {
  // Expand initial zone
  room.zoneStartX -= room.mapWidth / 2;
  room.zoneStartY -= room.mapHeight / 2;
  room.zoneEndX += room.mapWidth / 2;
  room.zoneEndY += room.mapHeight / 2;

  const baseZone = {
    zoneStartX: room.zoneStartX,
    zoneStartY: room.zoneStartY,
    zoneEndX: room.zoneEndX,
    zoneEndY: room.zoneEndY,
  };

  const zones = [
    { targetSize: room.mapHeight * 2,   waitTime: 20000, shrinkTime: 50000, damage: 2 },
    { targetSize: room.mapHeight * 1.3, waitTime: 20000, shrinkTime: 50000, damage: 5 },
    { targetSize: room.mapHeight * 0.6, waitTime: 20000, shrinkTime: 50000, damage: 12 },
    { targetSize: room.mapHeight * 0.4, waitTime: 20000, shrinkTime: 50000, damage: 20, drift_allowed: 0.7 },
    { targetSize: 0,                    waitTime: 20000, shrinkTime: 50000, damage: 15 },
  ];

  const phases = [];
  let prevZone = baseZone;

  for (const z of zones) {
    const { targetX, targetY } = generateRandomTarget(prevZone, z.targetSize, room.mapWidth, room.mapHeight, z.drift_allowed);

    const phase = {
      waitTime: z.waitTime,
      shrinkTime: z.shrinkTime,
      damagePerSecond: z.damage,
      targetX,
      targetY,
      targetSize: z.targetSize,
    };

    phases.push(phase);

    prevZone = {
      zoneStartX: targetX - z.targetSize / 2,
      zoneStartY: targetY - z.targetSize / 2,
      zoneEndX: targetX + z.targetSize / 2,
      zoneEndY: targetY + z.targetSize / 2,
    };
  }

  room.zonephases = phases;
  room.currentPhase = 0;

  startPhase(room);

  // 30 FPS zone movement
  room.shrinkInterval = room.setRoomInterval(
    () => smoothZoneMovement(room),
    100
  );

  // Damage every second
  room.damageInterval = room.setRoomInterval(
    () => dealDamage(room),
    1000
  );

  // Sync timer to clients every second
  room.zoneSyncInterval = room.setRoomInterval(() => {
    const timing = getPhaseTiming(room);
    if (!timing) return;

    room.sending_zone_data = {
      phase: room.currentPhase,
      state: timing.state,
      timeUntilShrink: formatTime(timing.remainingWait),
      timeUntilNextPhase: formatTime(timing.remainingTotal),
    }

   // console.log(room.sending_zone_data)
  }, 1000);
}

module.exports = {
  UseZone,
};
