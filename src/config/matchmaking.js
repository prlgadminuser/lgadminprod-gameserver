

const { generateUUID } = require("../utils/hash");
const { gamemodeconfig } = require("./gamemodes");

  // info all players under the first value here are all matched together players that have more
//  than that will be between the first and second value and so on
const matchmaking = {
 
  1: {
    1: 1000,
    2: 2000,
  }
}

const SkillbasedMatchmakingEnabled = false

function matchmakingsp(target) {
    // Convert the nested object into an array of values and sort them
    const values = Object.values(matchmaking[1]).sort((a, b) => a - b);
    
    let higherBound = values[values.length - 1]; // Start with the last value
    
    for (let i = 0; i < values.length; i++) {
      if (target < values[i]) {
        higherBound = values[i];
        break;
      }
    }
  
    return higherBound;
  }


class Matchmaker {
  constructor({ useSkillbasedMatchmaking = false } = {}) {
    this.useSkillbasedMatchmaking = useSkillbasedMatchmaking;
    this.roomIndex = new Map();
    this.rooms = new Map();
  }

  _getRoomKey(gamemode, spLevel) {
    return `${gamemode}_${spLevel}`;
  }

  findAvailableRoom(gamemode, spLevel) {
    const key = this._getRoomKey(gamemode, spLevel);
    const roomList = this.roomIndex.get(key);
    if (!roomList) return null;

    for (const room of roomList.values()) {
      if (room.state === "waiting" && room.connectedPlayers.size < room.maxplayers) {
        return room;
      }
    }
    return null;
  }

  addRoomToIndex(room) {
  const key = `${room.gamemode}_${room.sp_level}`;
  if (!roomIndex.has(key)) roomIndex.set(key, new Map());
  roomIndex.get(key).set(room.roomId, room);
}

  removeRoomFromIndex(room) {
  const key = `${room.gamemode}_${room.sp_level}`;
  const roomList = roomIndex.get(key);
  if (!roomList) return;

  roomList.delete(room.roomId);

  if (roomList.size === 0) {
    roomIndex.delete(key);
  }
}

  addRoom(room) {
    const key = this._getRoomKey(room.gamemode, room.sp_level);
    if (!this.roomIndex.has(key)) this.roomIndex.set(key, new Map());
    this.roomIndex.get(key).set(room.roomId, room);

    addRoomToIndex(room); // optional global registry sync
    this.rooms.set(room.roomId, room); // ensure global lookup works
  }

  removeRoom(room) {
    const key = this._getRoomKey(room.gamemode, room.sp_level);
    const roomList = this.roomIndex.get(key);
    if (!roomList) return;

    roomList.delete(room.roomId);
    if (roomList.size === 0) this.roomIndex.delete(key);

    removeRoomFromIndex(room);
    this.rooms.delete(room.roomId);
  }

  assignPlayer(ws, playerVerified, gamemode) {
    try {
      // Determine skill points if skill-based matchmaking is enabled
      const sp = this.useSkillbasedMatchmaking ? playerVerified.skillpoints || 0 : 0;
      const roomJoiningValue = matchmakingsp(sp);

      // Try to find an available room
      let room = this.findAvailableRoom(gamemode, roomJoiningValue);

      // Create new room if none available
      if (!room) {
        const gamemodeSettings = gamemodeconfig.get(gamemode);
        room = new Room(generateUUID(), gamemode, gamemodeSettings, roomJoiningValue);
        this.addRoom(room);
      }

      return room.addPlayer(ws, playerVerified);
    } catch (err) {
      console.error("Matchmaker assignPlayer error:", err);
      ws.close(4000, "Error joining room");
      throw err;
    }
  }
}



 // console.log(matchmakingsp("999"))
  
module.exports = {
    matchmakingsp,
    SkillbasedMatchmakingEnabled,
    Matchmaker
}