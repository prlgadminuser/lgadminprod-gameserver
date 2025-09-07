"use strict";

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


function getNotSeenStaticObjects(room, player, centerX, centerY) {

  const xMin = centerX - xThreshold;
  const xMax = centerX + xThreshold;
  const yMin = centerY - yThreshold;
  const yMax = centerY + yThreshold;

 
  const visible = room.notSeenObjectgrid.getObjectsInAreaStatic(xMin, xMax, yMin, yMax, player.seenObjectsIds);
  visible.forEach(obj => player.seenObjectsIds.add(obj.id));

   const formattedObjects = visible.length > 0
    ? visible.map(obj => [
      obj.type,
      obj.sendx, 
      obj.sendy
    ])
    : undefined;

     return formattedObjects;

}

 

function getNotSeenInLastTickRealTimeObjects(room, player, centerX, centerY) {
  const xMin = centerX - xThreshold;
  const xMax = centerX + xThreshold;
  const yMin = centerY - yThreshold;
  const yMax = centerY + yThreshold;

  // 1. Get nearby objects from spatial grid
  const nearby = room.notSeenObjectgrid.getObjectsInArea(xMin, xMax, yMin, yMax);

  const newSpawns = [];
   const newNearbySet = new Set();

  nearby.forEach(obj => {
    newNearbySet.add(obj.id);

    // 2. Only send full state if the player hasn't seen this object in the last check
    if (!player.lastNearbyObjects.has(obj.id)) {
      newSpawns.push([obj.id, obj.type, obj.x, obj.y, obj.hp, obj.rotation]);
    }
  });

  // 3. Update the lastNearbyObjects set for next tick
  player.lastNearbyObjects = newNearbySet;

  return newSpawns.length > 0 ? newSpawns : undefined;
}




function playerchunkrenderer(room) {

  const roomplayers = Array.from(room.players.values())

   roomplayers.forEach(player => {
   const nearbyObjectUpdateStatic = getNotSeenStaticObjects(room, player, player.x, player.y)
   player.newSeenObjectsStatic = nearbyObjectUpdateStatic  

   })

   
  const AlivePlayers = roomplayers.filter(p => !p.spectating);
  AlivePlayers.forEach(player =>  
  player.nearbyplayersids = getPlayersInRange(room, player.x, player.y).map(p => p.id)

  )}

module.exports = {
  playerchunkrenderer,
  getPlayersInRange,
  getNotSeenStaticObjects,
  getNotSeenInLastTickRealTimeObjects
};