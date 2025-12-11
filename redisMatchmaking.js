// matchmaking/adapter.js
const { EnableRedisMatchmaking } = require("../config/matchmaking");
const { redisClient } = require("./src/database/redisClient");

// In-memory fallback (your current system)
const inMemoryIndex = new Map(); // replaces your global roomIndex when Redis is off

// Helper: generate the Redis key
function getIndexKey(gamemode, spLevel) {
  return `roomindex:${gamemode}_${spLevel}`;
}

class RoomIndexAdapter {
  // Find an open room (waiting + not full)
  static async getAvailableRoom(gamemode, spLevel) {
    const key = `${gamemode}_${spLevel}`;

    if (!EnableRedisMatchmaking) {
      const roomList = inMemoryIndex.get(key);
      if (!roomList) return null;

      for (const room of roomList.values()) {
        if (room.state === "waiting" && room.players.size < room.maxplayers) {
          return room;
        }
      }
      return false;
    }

    // === Redis mode ===
    if (!redisClient?.isOpen) return false;

    const roomIds = await redisClient.sMembers(getIndexKey(gamemode, spLevel));
    for (const roomId of roomIds) {
      const data = await redisClient.hGetAll(`room:${roomId}`);
      if (data.state === "waiting" && parseInt(data.playerCount) < parseInt(data.maxplayers)) {
        return { roomId, isRemote: true }; // player will be redirected
      }
    }
    return false;
  }

  // Add room to global index
  static async addRoomToIndex(room) {
    if (!EnableRedisMatchmaking) {
      const key = `${room.gamemode}_${room.sp_level}`;
      if (!inMemoryIndex.has(key)) inMemoryIndex.set(key, new Map());
      inMemoryIndex.get(key).set(room.roomId, room);
      return;
    }

    if (!redisClient?.isOpen) return;

    const indexKey = getIndexKey(room.gamemode, room.sp_level);
    await redisClient.multi()
      .sAdd(indexKey, room.roomId)
      .hSet(`room:${room.roomId}`, {
        state: room.state,
        playerCount: room.players.size,
        maxplayers: room.maxplayers,
        gamemode: room.gamemode,
        sp_level: room.sp_level,
        host: process.env.HOST_ID || "unknown"
      })
      .expire(`room:${room.roomId}`, 3600)
      .exec();
  }

  // Remove room from index
  static async removeRoomFromIndex(room) {
    if (!EnableRedisMatchmaking) {
      const key = `${room.gamemode}_${room.sp_level}`;
      const list = inMemoryIndex.get(key);
      if (list) {
        list.delete(room.roomId);
        if (list.size === 0) inMemoryIndex.delete(key);
      }
      return;
    }

    if (!redisClient?.isOpen) return;

    const indexKey = getIndexKey(room.gamemode, room.sp_level);
    await redisClient.multi()
      .sRem(indexKey, room.roomId)
      .del(`room:${room.roomId}`)
      .exec();
  }

  // Optional: update player count in real time (call on join/leave)
  static async updatePlayerCount(room) {
    if (EnableRedisMatchmaking && redisClient?.isOpen) {
      await redisClient.hSet(`room:${room.roomId}`, "playerCount", room.players.size);
    }
  }
}

module.exports = { RoomIndexAdapter, inMemoryIndex };