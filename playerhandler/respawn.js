"use strict";
const UseStartRespawnPoint = false

function respawnplayer(room, player) {

 room.realtimegrid.removeObject(player);

  player.alive = false
  player.state = 2
  player.respawns--
  player.moving = false

  player.health = player.starthealth


  if (UseStartRespawnPoint) {
  player.timeoutIds.push(setTimeout(() =>{
  player.x = player.startspawn.x
   player.y = player.startspawn.y
  }, 3000));
}

  player.timeoutIds.push(setTimeout(() =>{
     room.realtimegrid.addObject(player);
    player.spectating = false
    player.alive = true
    player.state = 1
    }, 5000));


    
 }


 module.exports = {
  respawnplayer,
};
