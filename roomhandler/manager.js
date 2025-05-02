

const roomIndex = new Map();
const rooms = new Map();

function removeRoomFromIndex(room) {
    const key = `${room.gamemode}_${room.sp_level}`;
  
    // Check if the index contains the key
    if (!roomIndex.has(key)) return;
  
    // Get the list of rooms for this key
    const roomList = roomIndex.get(key);
  
    // Filter out the room to be removed
    const updatedRoomList = roomList.filter(existingRoom => existingRoom.roomId !== room.roomId);
  
    if (updatedRoomList.length > 0) {
      // Update the index with the filtered list
      roomIndex.set(key, updatedRoomList);
    } else {
      // If the list is empty, remove the key from the index
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
    }
  }

  module.exports = {
    closeRoom,
    roomIndex,
    rooms,
  }
  