
const { Player } = require("../RoomHandler/AddPlayer");

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

module.exports = {playerPool}

