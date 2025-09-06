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



function getNotSeenObjects(room, player, centerX, centerY) {

  const xMin = centerX - xThreshold;
  const xMax = centerX + xThreshold;
  const yMin = centerY - yThreshold;
  const yMax = centerY + yThreshold;

 
  const visible = room.notSeenObjectgrid.getObjectsInArea(xMin, xMax, yMin, yMax, player.seenObjectsIds);
  visible.forEach(obj => player.seenObjectsIds.add(obj.id));

   const formattedObjects = visible.length > 0
    ? visible.map(obj => [
      obj.type,
      obj.sendx, 
      obj.sendy
    ])
    : undefined;

    // player.newSeenObjects = formattedObjects
     return formattedObjects;

}



function playerchunkrenderer(room) {

  const roomplayers = Array.from(room.players.values())

   roomplayers.forEach(player =>  
  player.newSeenObjects = getNotSeenObjects(room, player, player.x, player.y),
);

  const AlivePlayers = roomplayers.filter(p => !p.spectating);
  AlivePlayers.forEach(player =>  
  player.nearbyplayersids = getPlayersInRange(room, player.x, player.y).map(p => p.id)
);

}

module.exports = {
  playerchunkrenderer,
  getPlayersInRange,
  getNotSeenObjects
};