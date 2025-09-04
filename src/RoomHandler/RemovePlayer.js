const { addEntryToKillfeed } = require("../Battle/GameLogic/killfeed");
const {
  checkGameEndCondition,
  eliminatePlayer,
} = require("../Battle/PlayerLogic/eliminated");
const { UpdatePlayerKillsAndDamage } = require("../Database/ChangePlayerStats");
const { closeRoom } = require("./closeRoom");
const { playerLookup } = require("./setup");

function RemovePlayerFromRoom(room, player) {
  if (!player || !room) return;

  if (room && !player.eliminated && room.state !== "waiting")
    eliminatePlayer(room, player);
  addEntryToKillfeed(room, 5, null, player.id, null);

  player.timeoutIds?.forEach(clearTimeout);
  player.intervalIds?.forEach(clearInterval);
  player.alive = false;
  player.eliminated = true;

  player.wsClose();
  playerLookup.delete(player.playerId);

  if (player.kills > 0 || player.damage > 0) UpdatePlayerKillsAndDamage(player);

  if (room.state === "waiting") {
    room.players.delete(player.playerId);

    if (room.players.size < 1) {
      closeRoom(room.roomId);
      return;
    }

  } else {
    if (room.players.size < 1) {
      closeRoom(room.roomId);
      return;
    }

    if (room.grid) checkGameEndCondition(room);

    if (room && room.players.size > 1) {
      room.timeoutIds.push(
        setTimeout(() => {
          if (room) {
            room.players.delete(player.playerId);
          }
        }, 4000)
      );
    } else {
      room.players.delete(player.playerId);
    }
  }
  if (room.players.size < 1) {
    closeRoom(room.roomId);
    return;
  }
}

module.exports = { RemovePlayerFromRoom };
