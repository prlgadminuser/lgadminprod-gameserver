"use strict";

const viewmultiplier = 1
const xThreshold = 420 * viewmultiplier;
const yThreshold = 240 * viewmultiplier;

function getPlayerViewObjects(room, player) {

  const centerX = player.x;
  const centerY = player.y;

  const xMin = centerX - xThreshold;
  const xMax = centerX + xThreshold;
  const yMin = centerY - yThreshold;
  const yMax = centerY + yThreshold;

  // --- 1. Get all objects in the area ---
  const nearbyObjects = room.grid.getObjectsInArea(xMin, xMax, yMin, yMax);

  const otherPlayers = [];
  const otherPlayersIds = [];
  const nearbyBullets = [];
  const staticObjects = [];
  const RealtimeObjects = [];


  for (const obj of nearbyObjects) {

    switch (obj.type) {

      case "player":
          otherPlayers.push(obj);
          otherPlayersIds.push(obj.id);
        
        break;


      case "bullet":
        nearbyBullets.push(obj);

        break;

      case "static_obj":
        // --- track "first-time seen" static objects ---
        if (!player.seenObjectsIds.has(obj.id)) {
          player.seenObjectsIds.add(obj.id);
          staticObjects.push([1, obj.sendx, obj.sendy]);
        }
        break;

      case "realtime_obj":
        // --- track other realtime spawns not seen in last tick ---
        if (!player.lastNearbyObjects.has(obj.id)) {
          RealtimeObjects.push([obj.id, obj.type, obj.x, obj.y, obj.hp, obj.rotation]);
        }
        break;
    }
  }

  // --- 2. Assign results back to player ---
  player.nearbyplayersids = otherPlayersIds;
  player.nearbyplayers = otherPlayers
  player.nearbybullets = nearbyBullets;
  player.newSeenObjectsStatic = staticObjects.length ? staticObjects : undefined;
  player.newSeenRealtimeObjects = RealtimeObjects.length ? RealtimeObjects : undefined;
}

function playerchunkrenderer(room) {
  const roomplayers = Array.from(room.players.values());
  roomplayers.forEach(player => getPlayerViewObjects(room, player));
}


function getPlayersInRange(room, centerX, centerY) {

  const xMin = centerX - xThreshold;
  const xMax = centerX + xThreshold;
  const yMin = centerY - yThreshold;
  const yMax = centerY + yThreshold;

 const nearbyPlayers = room.grid.getObjectsInArea(xMin, xMax, yMin, yMax, "player");

  return nearbyPlayers;
}

module.exports = {
  getPlayerViewObjects,
  playerchunkrenderer,
  getPlayersInRange
};


