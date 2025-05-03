
const roomIndex = new Map();
const rooms = new Map();

function getAvailableRoom(gamemode, spLevel) {
  const key = `${gamemode}_${spLevel}`;
  const roomList = roomIndex.get(key);
  if (!roomList) return null;

  for (const room of roomList.values()) {
    if (room.players.size < room.maxplayers && room.state === 'waiting') {
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




function closeRoom(roomId) {
    const room = rooms.get(roomId);
  
    if (room) {
      room.timeoutIds?.forEach(clearTimeout);
      room.intervalIds?.forEach(clearInterval);
  
      room.players.forEach(player => {
        player.timeoutIds?.forEach(clearTimeout);
        player.intervalIds?.forEach(clearInterval);
        player.ws.close();
      });
  
  
      clearTimeout(room.matchmaketimeout)
      clearTimeout(room.maxopentimeout)
      clearInterval(room.xcleaninterval)
  
      rooms.delete(roomId);
      removeRoomFromIndex(room);

      const room2 = rooms.get(roomId);

      console.log(room2)
      console.log(rooms.size)
    }
  }

  module.exports = {
    closeRoom,
    roomIndex,
    addRoomToIndex,
    getAvailableRoom,
    rooms,
  }
  