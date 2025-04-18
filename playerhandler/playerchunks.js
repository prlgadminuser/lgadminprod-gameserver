
"use strict";



function findNearestEvents(player, room) {
  const grid = room.itemgrid; // Assume room.grid is your SpatialGrid

  // Define the search area around the player (radius search area)
  const searchRadius = 400 // Search area in pixels around the player
  const xMin = player.x - searchRadius;
  const xMax = player.x + searchRadius;
  const yMin = player.y - searchRadius;
  const yMax = player.y + searchRadius;


  const objectsInArea = grid.getObjectsInArea(xMin, xMax, yMin, yMax);

  // Filter and map the circles in the area
  const circles = objectsInArea
  .filter(obj => obj.id === "circle")
  .map(circle => [
    circle.type,
    circle.x,
    circle.y,
    circle.radius
  ].join(':'));

  const animations = {};
objectsInArea
  .filter(obj => obj.id === "death" || obj.id === "respawn")
  .forEach(obj => {
    animations[obj.obj_id] = `${obj.type}:${obj.x}:${obj.y}`;
  });

// Assign the results to the player
player.nearbycircles = circles;
player.nearbyanimations = animations;
}


function getPlayersInRange(players, centerX, centerY, xThreshold, yThreshold, excludePlayerId) {
  const playersInRange = new Set();

  players.forEach(player => {
    if (player.nmb !== excludePlayerId) {
      const isNearX = Math.abs(player.x - centerX) <= xThreshold;
      const isNearY = Math.abs(player.y - centerY) <= yThreshold;

      if (isNearX && isNearY) {
        playersInRange.add(player.nmb);
      }
    }
  });

  return playersInRange;
}


function UpdatePlayerChunks(room, player) {

  player.nearbyplayers = getPlayersInRange(Array.from(room.players.values()).filter(p => p.visible), player.x, player.y, 400, 300, player.nmb);

}

function UpdatePlayerEvents(room, player) {

}
    



function playerchunkrenderer(room) {

  room.intervalIds.push(setInterval(() => {

    room.players.forEach((player) => {

      UpdatePlayerChunks(room, player)

    });
  }, 250));



 /* room.intervalIds.push(setInterval(() => {

    room.players.forEach((player) => {

      findNearestEvents(player, room)

    });
  }, 100));
  */
}

module.exports = {
    playerchunkrenderer
  };
  
