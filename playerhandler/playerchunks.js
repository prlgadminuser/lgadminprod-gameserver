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

function getPlayersInRange(room, centerX, centerY, xThreshold, yThreshold, excludePlayer) {
  const nearbyPlayers = room.realtimegrid.getObjectsInArea(
  centerX - xThreshold,
  centerX + xThreshold,
  centerY - yThreshold,
  centerY + yThreshold,
);

const others = nearbyPlayers.filter(p => p !== excludePlayer && p.isPlayer);

return others
}

function UpdatePlayerChunks(room, player) {
  const nearbyIds = getPlayersInRange(room, player.x, player.y, 300, 170)
    .map(p => p.nmb);

  const nearbySet = player.nearbyplayers;
  nearbySet.clear();       // remove all old IDs
  for (const id of nearbyIds) {
    nearbySet.add(id);     // add current nearby IDs
  }

}




function playerchunkrenderer(room) {
  const updatePlayers = () => {
  //  const visiblePlayers = Array.from(room.players.values()).filter(p => p.visible);

    const visiblePlayers = Array.from(room.players.values());
    visiblePlayers.forEach(player => UpdatePlayerChunks(room, player));
  };

  const updateEvents = () => {
    room.players.forEach(player => findNearestEvents(player, room));
  };

  // Run immediately
  updatePlayers();
  updateEvents();

  // Then schedule intervals
  room.intervalIds.push(setInterval(updatePlayers, 50));
  room.intervalIds.push(setInterval(updateEvents, 50));
}

module.exports = {
  playerchunkrenderer
};
