const { random_mapkeys, mapsconfig, game_tick_rate, player_idle_timeout, deepCopy, matchmaking_timeout } = require("@main/modules");
const { rooms } = require("./setup");
const { BulletManager } = require("../Battle/WeaponLogic/bullets");
const { addRoomToIndex, removeRoomFromIndex } = require("./roomIndex");
const { preparePlayerPackets, sendPlayerPackets } = require("../Battle/NetworkLogic/Packets");
const { UpdatePlayerKillsAndDamage } = require("../Database/ChangePlayerStats");


function cleanupRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room) {
    return;
  }

  // Clear the cleanup interval if it exists
  if (room.cleanupinterval) {
    clearInterval(room.cleanupinterval);
  }

  const playersWithOpenConnections = room.players.filter(
    (player) => player.wsReadyState() === WebSocket.OPEN
  );

  //console.log(playersWithOpenConnections);
  // Close the room if it has no players
  if (
    room.players.size < 1 ||
    playersWithOpenConnections.length < 1 ||
    !room.players ||
    room.players.size === 0
  ) {
    room.close();
  }
}


function clearAndRemoveInactiveTimers(timerArray, clearFn) {
  return timerArray.filter((timer) => {
    if (timer._destroyed || timer._idleTimeout === -1) {
      // Timer is already destroyed or no longer active
      clearFn(timer); // Clear the timeout or interval
      return false; // Remove from the array
    }
    return true; // Keep active timers
  });
}

function clearAndRemoveCompletedTimeouts(timeoutArray, clearFn) {
  return timeoutArray.filter((timeout) => {
    if (timeout._destroyed || timeout._idleTimeout === -1 || timeout._called) {
      // _called indicates that the timeout has already been executed (Node.js)
      clearFn(timeout);
      return false; // Remove from the array as it's completed or inactive
    }
    return true; // Keep active timeouts
  });
}



class Room {
  constructor(roomId, gamemode, gmconfig, splevel) {
    // Select map
    let mapid;
    if (gmconfig.custom_map) {
      mapid = `${gmconfig.custom_map}`;
    } else {
      const randomIndex = Math.floor(Math.random() * random_mapkeys.length);
      mapid = random_mapkeys[randomIndex];
    }

    const mapdata = mapsconfig.get(mapid);
    if (!mapdata) console.error("map does not exist");

    // Core room state
    this.roomId = roomId;
    this.state = "waiting";
    this.sp_level = splevel;
    this.maxplayers = gmconfig.maxplayers;
    this.gamemode = gamemode;
    this.IsTeamMode = gmconfig.teamsize > 1;
    this.matchtype = gmconfig.matchtype;
    this.players = new Map();
    this.eliminatedTeams = [];
    this.currentplayerid = 0;
    this.killfeed = [];
    this.objects = [];
    this.winner = -1;
    this.countdown = undefined;
    this.rdlast = [];
    this.gameconfig = gmconfig
    this.playerspeed = gmconfig.playerspeed

    // Bullets + status
    this.bullets = new Map();
    this.activeAfflictions = [];
    
    // Game configuration
    this.modifiers = gmconfig.modifiers;
    this.respawns = gmconfig.respawns_allowed;
    this.place_counts = gmconfig.placereward;
    this.ss_counts = gmconfig.seasoncoinsreward;
    this.teamsize = gmconfig.teamsize;
    this.weapons_modifiers_override = gmconfig.weapons_modifiers_override;

    // Map data
    this.mapdata = mapdata;
    this.map = mapid;
    this.mapHeight = mapdata.height;
    this.mapWidth = mapdata.width;
    this.spawns = mapdata.spawns;
    this.walls = mapdata.walls;
    this.zoneStartX = -mapdata.width;
    this.zoneStartY = -mapdata.height;
    this.zoneEndX = mapdata.width;
    this.zoneEndY = mapdata.height;
    this.zone = 0;

    // Optional dummies
    if (gmconfig.can_hit_dummies && mapdata.dummies) {
      this.dummies = deepCopy(mapdata.dummies);
    }

    // Config
    this.config = {
      canCollideWithDummies: gmconfig.can_hit_dummies,
      canCollideWithPlayers: gmconfig.can_hit_players,
    };

    // Managers + helpers
    this.bulletManager = new BulletManager(this);
    this.playerDataBuffer = new Map();
    this.intervalIds = [];
    this.timeoutIds = [];
    this.lastglobalping = 0;

    // Register room globally
    addRoomToIndex(this);
    rooms.set(roomId, this);

    // Setup timers/intervals
    this.initIntervals();
  }


  addPlayer(playerId, player) {
    this.players.set(playerId, player);
  }

   hasWinner() {
    return this.winner !== -1;
  }

   canStartGame() {
    return this.players.size >= this.maxplayers && this.state === "waiting";
  }

   setRoomTimeout(fn, ms) {
    const id = setTimeout(fn, ms);
    this.timeoutIds.push(id);
    return id;
  }

  setRoomInterval(fn, ms) {
    const id = setInterval(fn, ms);
    this.intervalIds.push(id);
    return id;
  }


  clearTimers() {
    this.intervalIds.forEach(clearInterval);
    this.timeoutIds.forEach(clearTimeout);

    clearInterval(this.xcleaninterval);
    clearInterval(this.timeoutdelaysending);
    clearInterval(this.countdownInterval);
    clearTimeout(this.matchmaketimeout);
    clearTimeout(this.maxopentimeout);
    clearTimeout(this.driftdelay1)
    clearTimeout(this.driftdelay2)

    this.intervalIds = [];
    this.timeoutIds = [];
  }

  // Clean up all players
  cleanupPlayers() {
    this.players.forEach(player => {
      // Close player connection
      player.wsClose();

      // Clear bullets / state
      player.bullets?.clear();

      // Update player stats if needed
      if (player.kills > 0 || player.damage > 0) {
        UpdatePlayerKillsAndDamage(player, player.kills, player.damage);
      }
    });
  }

  // Fully close the room
  close() {
    if (this.state === "closed") return;

    // Stop timers
    this.clearTimers();

    // Cleanup players
    this.cleanupPlayers();
    this.players.clear();

    // Remove from global registries
    removeRoomFromIndex(this);
    rooms.delete(this.roomId);

    this.state = "closed";
   // console.log(`Room ${this.roomId} closed`);
  }

  initIntervals() {
    // Idle player cleanup
    this.intervalIds.push(
      setInterval(() => {
        const now = Date.now();
        for (const player of this.players.values()) {
          if (player.lastPing <= now - player_idle_timeout || !player.wsOpen()) {
            player.wsClose(4200, "disconnected_inactivity");
          }
        }
      }, player_idle_timeout / 2)
    );

    // Cleanup expired intervals/timeouts
    this.xcleaninterval = setInterval(() => {
      if (this.timeoutIds) {
        this.timeoutIds = clearAndRemoveCompletedTimeouts(
          this.timeoutIds,
          clearTimeout
        );
      }
      if (this.intervalIds) {
        this.intervalIds = clearAndRemoveInactiveTimers(
          this.intervalIds,
          clearInterval
        );
      }
    }, 5000);

    // Matchmaking timeout
    this.matchmaketimeout = setTimeout(() => {
      this.players.forEach((player) => {
        player.send("matchmaking_timeout");
      });
     this.close();
    }, matchmaking_timeout);

    this.startGameLoop(game_tick_rate);
  }


    // Game tick loop
  startGameLoop(game_tick_rate) {
  const idealDt = game_tick_rate; // e.g., 25 ms for 40 Hz
  this._tickTimes = [];

  const tick = () => {
    const now = Date.now();

    // Run game logic
    const tStart = now;
    preparePlayerPackets(this);

    this.timeoutdelaysending = setTimeout(() => sendPlayerPackets(this), 5);

    // Track tick duration
    const tickTime = Date.now() - tStart;
    this._tickTimes.push(tickTime);

    if (this._tickTimes.length >= 200) {
      const mspt = this._tickTimes.reduce((a,b) => a+b,0)/this._tickTimes.length;
      const variance = this._tickTimes.reduce((a,b) => a + Math.pow(b - mspt,2),0) / this._tickTimes.length;
      const stddev = Math.sqrt(variance);
      console.log(`ms/tick: ${mspt.toFixed(2)} ± ${stddev.toFixed(2)} | Load: ${((mspt / idealDt)*100).toFixed(1)}%`);
      this._tickTimes.length = 0;
    }

    // Schedule next tick with drift compensation
    const delay = Math.max(0, idealDt - (Date.now() - now));
    this.driftdelay1 = setTimeout(tick, delay);
  };

  this.driftdelay2 = setTimeout(tick, idealDt);
}

    // Cleanup cycle
   /* this.timeoutIds.push(
      setTimeout(() => {
        this.intervalIds.push(
          setInterval(() => {
            cleanupRoom(this);
          }, 1000)
        );
      }, 10000)
    );

    */

}


module.exports = { Room };

