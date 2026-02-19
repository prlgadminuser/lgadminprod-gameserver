
const { Player } = require("../objects/player");

class PlayerPool {
  constructor() {
    this.pool = [];
  }

  acquire(ws, playerVerified, room) {
    const player = this.pool.length ? this.pool.pop() : new Player(ws, playerVerified, room);
    player.reset(ws, playerVerified, room);
    return player;
  }

  release(player) {
    player.room = null;
    player.ws = null;
    this.pool.push(player);
  }
}

const playerPool = new PlayerPool();


// --- RoomPool.js ---
class RoomPool {
  constructor(RoomClass) {
    this.pool = [];
    this.RoomClass = RoomClass;
  }

  acquire(roomId, gamemode, settings, matchmakingValue) {
    let room;
    if (this.pool.length > 0) {
      room = this.pool.pop();
      room.reset(roomId, gamemode, settings, matchmakingValue);
    } else {
      room = new this.RoomClass(roomId, gamemode, settings, matchmakingValue);
    }
    return room;
  }

  release(room) {
    // Clean references to players
    room.resetToEmpty();
    this.pool.push(room);
  }
}

module.exports = {playerPool}

