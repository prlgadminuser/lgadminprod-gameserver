"use strict";

const { spawnAnimation } = require("@main/src/gameObjectEvents/animations");

const UseStartRespawnPoint = false

function respawnplayer(room, player) {

  spawnAnimation(room, player, "respawning");
  player.alive = false
  player.state = 2
  player.moving = false
  player.last_hitter = false
  room.grid.removeObject(player);

  player.respawns--
  player.health = player.starthealth

  if (UseStartRespawnPoint) {
    room.setRoomTimeout(() => {
  player.x = player.startspawn.x
   player.y = player.startspawn.y
  }, 3000);
}

  room.setRoomTimeout(() => {
     room.grid.addObject(player);
    player.spectating = false
    player.alive = true
    player.state = 1
    }, 5000); 
 }

 module.exports = {
  respawnplayer,
};
