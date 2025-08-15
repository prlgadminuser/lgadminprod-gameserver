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
    const animations = {};

  for (const obj of objectsInArea) {
    if (obj.id === "circle") {
      circles.push([obj.type, obj.x, obj.y, obj.radius]);
    } else if (obj.id === "death" || obj.id === "respawn") {
      animations[obj.obj_id] = [obj.type, obj.x, obj.y];
    }
  }
  
   player.nearbycircles = circles;
  player.nearbyanimations = animations;

}

function getPlayersInRange(players, centerX, centerY, xThreshold, yThreshold, excludePlayerId) {
  return players
    .filter(p => p.nmb !== excludePlayerId && Math.abs(p.x - centerX) <= xThreshold && Math.abs(p.y - centerY) <= yThreshold)
    .map(p => p.nmb);
}

function UpdatePlayerChunks(visiblePlayers, player) {
  player.nearbyplayers = getPlayersInRange(visiblePlayers, player.x, player.y, 400, 270, player.nmb);
}

function playerchunkrenderer(room) {
  const updatePlayers = () => {
  //  const visiblePlayers = Array.from(room.players.values()).filter(p => p.visible);

    const visiblePlayers = Array.from(room.players.values());
    visiblePlayers.forEach(player => UpdatePlayerChunks(visiblePlayers, player));
  };

  const updateEvents = () => {
    room.players.forEach(player => findNearestEvents(player, room));
  };

  // Run immediately
  updatePlayers();
  updateEvents();

  // Then schedule intervals
  room.intervalIds.push(setInterval(updatePlayers, 100));
  room.intervalIds.push(setInterval(updateEvents, 50));
}

module.exports = {
  playerchunkrenderer
};
