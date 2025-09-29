const { addEntryToKillfeed } = require("../Battle/GameLogic/killfeed");
const {
  checkGameEndCondition,
  eliminatePlayer,
} = require("../Battle/PlayerLogic/eliminated");
const { UpdatePlayerKillsAndDamage } = require("../Database/ChangePlayerStats");
const { playerLookup } = require("./setup");

function RemovePlayerFromRoom(room, player) {
  if (!player || !room) return;

  if (room && !player.eliminated && room.state !== "waiting")
    eliminatePlayer(room, player);
  addEntryToKillfeed(room, 5, null, player.id, null);

  player.alive = false;
  player.eliminated = true;

  player.wsClose();
  playerLookup.delete(player.playerId);

  if (player.kills > 0 || player.damage > 0) UpdatePlayerKillsAndDamage(player);

  if (room.state === "waiting") {
    room.players.delete(player.playerId);

    if (room.players.size < 1) {
      room.close();
      return;
    }
  } else {
    if (room.players.size < 1) {
      room.close();
      return;
    }

    if (room.grid) checkGameEndCondition(room);
    if (room) {
      if (room.players.size > 1) {
        room.setRoomTimeout(() => {
          if (room) {
            room.players.delete(player.playerId);
            // optionally check if room is now empty
            if (room.players.size < 1) {
              room.close();
            }
          }
        }, 4000);
      } else {
        room.players.delete(player.playerId);
        if (room.players.size < 1) {
          room.close();
        }
      }
    }
  }
}

module.exports = { RemovePlayerFromRoom };
