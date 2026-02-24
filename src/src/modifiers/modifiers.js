"use strict";

function forEachAlive(room, fn) {
  if (room.state === "playing" && room.winner === -1) {
    for (const player of room.alivePlayers) fn(player);
  }
}





function startDecreasingHealth(room, seconds) {
  room.setRoomInterval(() => decreaseHealth(room), seconds * 1000);
}

function decreaseHealth(room) {
  forEachAlive(room, (player) => player.damagePlayer(6));
}





function startRegeneratingHealth(room, seconds) {
  room.setRoomInterval(() => regenerateHealth(room), seconds * 1000);
}

function regenerateHealth(room) {
  const now = Date.now();
  forEachAlive(room, (player) => {
    if (now - player.last_hit_time > 10000) player.healPlayer(6);
  });
}




module.exports = { startDecreasingHealth, startRegeneratingHealth };
