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

  const circles = [];

  for (const obj of objectsInArea) {
    if (obj.id === "circle") {
      circles.push([obj.type, obj.x, obj.y, obj.radius]);
    }
  }
  
   player.nearbycircles = circles;
}

const xThreshold = 380
const yThreshold = 300

function getPlayersInRange(room, centerX, centerY) {

  const xMin = centerX - xThreshold;
  const xMax = centerX + xThreshold;
  const yMin = centerY - yThreshold;
  const yMax = centerY + yThreshold;

   const nearbyPlayers = room.realtimegrid.getObjectsInArea(xMin, xMax, yMin, yMax);

  // Filter out the excluded player and non-player objects,
  // and ensure they are actually within the rectangle
  const others = nearbyPlayers.filter(p =>
    p.isPlayer &&
    p.x >= xMin &&
    p.x <= xMax &&
    p.y >= yMin &&
    p.y <= yMax
  );

  return others;
}


function UpdatePlayerChunks(room, player) {
const nearbyPlayersIdsArray = getPlayersInRange(room, player.x, player.y)
    .map(p => p.nmb);

 player.nearbyplayers = nearbyPlayersIdsArray
 player.nearbyplayersids = nearbyPlayersIdsArray
}




function playerchunkrenderer(room) {
  
  const AlivePlayers = Array.from(room.players.values()).filter(p => !p.spectating);

   AlivePlayers.forEach(player => UpdatePlayerChunks(room, player));
  
  room.players.forEach(player => findNearestEvents(player, room));
}

module.exports = {
  playerchunkrenderer,
  getPlayersInRange,
};
