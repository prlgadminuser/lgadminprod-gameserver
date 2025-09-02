const { UpdatePlayerKillsAndDamage } = require("../Database/ChangePlayerStats");
const { removeRoomFromIndex } = require("./roomIndex");
const { rooms } = require("./setup");

function closeRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  room.timeoutIds?.forEach(clearTimeout);
  room.intervalIds?.forEach(clearInterval);

  room.players.forEach(player => {
    player.timeoutIds?.forEach(clearTimeout);
    player.intervalIds?.forEach(clearInterval);
    player.wsClose();
    player.bullets?.clear();
    player.nearbyplayers = []; 

     if (player.kills > 0 || player.damage > 0)
      UpdatePlayerKillsAndDamage(player, player.kills, player.damage);

  });

  clearTimeout(room.matchmaketimeout);
  clearTimeout(room.maxopentimeout);
  clearInterval(room.xcleaninterval);
  clearInterval(room.timeoutdelaysending);
  clearInterval(room.countdownInterval);
  removeRoomFromIndex(room);
  room.players.clear();
  rooms.delete(roomId);
//  const room1 = rooms.get(roomId);
//  console.log(room1)
}

module.exports = { closeRoom }