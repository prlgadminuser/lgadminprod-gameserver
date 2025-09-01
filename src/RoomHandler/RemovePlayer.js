const { UpdatePlayerKillsAndDamage } = require("../Database/ChangePlayerStats");



function RemovePlayerFromRoom(room, player) {
  player.timeoutIds?.forEach(clearTimeout);
  player.intervalIds?.forEach(clearInterval);
  player.visible = false
  player.eliminated = true
 
  player.wsClose();
  player.nearbyplayers = [];

  if (player.kills > 0 || player.damage > 0)
     UpdatePlayerKillsAndDamage(player);
  

   player.wsClose();


  if (room.state === "waiting") {
     
    room.players.delete(player.playerId)

  } else {

      room.timeoutIds.push(setTimeout(() => {
      if (room) {
        room.players.delete(player.playerId)
      }
    }, 4000));
 
  }

  
}

module.exports = { RemovePlayerFromRoom }