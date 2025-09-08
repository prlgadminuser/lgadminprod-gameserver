const { roomIndex } = require("./setup");


function getAvailableRoom(gamemode, spLevel) {
  const key = `${gamemode}_${spLevel}`;
  const roomList = roomIndex.get(key);
  if (!roomList) return null;

  for (const room of roomList.values()) {
    if (room.state === 'waiting' && room.players.size < room.maxplayers) {
      return room;
    }
  }
  return false;
}

function addRoomToIndex(room) {
  const key = `${room.gamemode}_${room.sp_level}`;
  if (!roomIndex.has(key)) roomIndex.set(key, new Map());
  roomIndex.get(key).set(room.roomId, room);
}

function removeRoomFromIndex(room) {
  const key = `${room.gamemode}_${room.sp_level}`;
  const roomList = roomIndex.get(key);
  if (!roomList) return;

  roomList.delete(room.roomId);

  if (roomList.size === 0) {
    roomIndex.delete(key);
  }

}

module.exports = {getAvailableRoom, addRoomToIndex, removeRoomFromIndex }
