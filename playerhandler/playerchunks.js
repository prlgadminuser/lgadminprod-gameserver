"use strict";

function findNearestEvents(player, room) {
  const grid = room.itemgrid;

  const searchRadiusX = 400;
  const searchRadiusY = 240;

  const xMin = player.x - searchRadiusX;
  const xMax = player.x + searchRadiusX;
  const yMin = player.y - searchRadiusY;
  const yMax = player.y + searchRadiusY;

  const objectsInArea = grid.getObjectsInArea(xMin, xMax, yMin, yMax);

  // Single pass through objectsInArea
  const circles = [];
    const animations = [];

  for (const obj of objectsInArea) {
    if (obj.id === "circle") {
      circles.push([obj.type, obj.x, obj.y, obj.radius]);
    } else if (obj.id === "death" || obj.id === "respawn") {
      animations.push([obj.type, obj.x, obj.y]);
    }
  }
  
   player.nearbycircles = circles;
  player.nearbyanimations = animations;

}

const xThreshold = 330
const yThreshold = 190

function getPlayersInRange(room, centerX, centerY, excludePlayer) {

  const xMin = centerX - xThreshold;
  const xMax = centerX + xThreshold;
  const yMin = centerY - yThreshold;
  const yMax = centerY + yThreshold;

   const nearbyPlayers = room.realtimegrid.getObjectsInArea(xMin, xMax, yMin, yMax);

  // Filter out the excluded player and non-player objects,
  // and ensure they are actually within the rectangle
  const others = nearbyPlayers.filter(p =>
    p !== excludePlayer &&
    p.isPlayer &&
    p.x >= xMin &&
    p.x <= xMax &&
    p.y >= yMin &&
    p.y <= yMax
  );

  return others;
}

function UpdatePlayerChunks(room, player) {
  const nearbyIds = getPlayersInRange(room, player.x, player.y)
    .map(p => p.nmb);

  const nearbySet = player.nearbyplayers;
  nearbySet.clear();       // remove all old IDs
  for (const id of nearbyIds) {
    nearbySet.add(id);     // add current nearby IDs
  }
}




function playerchunkrenderer(room) {
  
  const visiblePlayers = Array.from(room.players.values()).filter(p => p.visible);

   // const visiblePlayers = Array.from(room.players.values());
    visiblePlayers.forEach(player => UpdatePlayerChunks(room, player));
  
    room.players.forEach(player => findNearestEvents(player, room));
}

module.exports = {
  playerchunkrenderer,
};
