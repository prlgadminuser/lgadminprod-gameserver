
//const { addRoomToIndex, removeRoomFromIndex } = require("./matchmaking");
const { matchmaking_timeout, game_tick_rate, player_idle_timeout, game_start_time, game_win_rest_time } = require("../config/server");
const { UpdatePlayerKillsAndDamage, UpdatePlayerPlace, UpdatePlayerWins } = require("../database/ChangePlayerStats");
const { addEntryToKillfeed } = require("../modifiers/killfeed");
const { BulletManager } = require("../objects/bullets");
const { Player } = require("../objects/player");
const { preparePlayerPackets, sendPlayerPackets } = require("../packets/Packets");
const { deepCopy, generateUUID } = require("../utils/hash");
const { random_mapkeys, mapsconfig } = require("../config/maps");

const rooms = new Map();
const playerLookup = new Map();
const roomIndex = new Map();

//const { RoomIndexAdapter, inMemoryIndex } = require("./matchmaking/adapter.js");

const { gadgetconfig } = require("../config/gadgets");
const { SkillbasedMatchmakingEnabled, matchmakingsp } = require("../config/matchmaking");
const { GameGrid } = require("../config/grid");
const { SendPreStartMessage } = require("../packets/Packets");
const { UseZone } = require("../modifiers/zone");
const { startDecreasingHealth, startRegeneratingHealth } = require("../modifiers/modifiers");
const { initializeHealingCircles } = require("../modifiers/healingcircle");
const { room_max_open_time } = require("../config/server");
const { gamemodeconfig } = require("../config/gamemodes");


async function GetRoom(ws, gamemode, playerVerified) {
  try {

    const max_length = 16;
    const min_length = 4;
    const nickname = playerVerified.nickname;
    const gadgetselected = playerVerified.gadget || 1;

    if (
      nickname.length < min_length ||
      nickname.length > max_length ||
      !(gadgetselected in gadgetconfig)
    ) {
      return ws?.close(4004);
    }

     const roomId = `room_${Date.now()}_${Math.floor(Math.random() * 9999)}`;
  const gmconfig = gamemodeconfig.get(gamemode);

  const room = new Room(roomId, gamemode, gmconfig, 0); // 0 = skill points
  await room.addPlayer(ws, playerVerified);
  return room;

  } catch (error) {
    console.error("Error joining room:", error);
    payload.ws?.close(4000, "Error joining room");
    throw error;
  }
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
    this.alivePlayers = new Set();
    this.connectedPlayers = new Set();
    this.eliminatedTeams = [];
    this.currentplayerid = 0;
    this.killfeed = [];
    this.objects = [];
    this.winner = -1;
    this.countdown = undefined;
    this.rdlast = [];
    this.gameconfig = gmconfig;
    this.playerspeed = gmconfig.playerspeed;

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

    process.send({
  type: "ROOM_CREATED",
  roomId: this.roomId,
  gamemode: this.gamemode,
  sp: this.sp_level,
  maxPlayers: this.maxplayers
});

    // Setup timers/intervals
    this.initIntervals();
  }

  async addPlayer(ws, playerVerified) {
  const newPlayer = new Player(ws, playerVerified, this);
  this.players.set(newPlayer.playerId, newPlayer);
  playerLookup.set(newPlayer.playerId, newPlayer);

  process.send({
    type: "ROOM_UPDATE",
    roomId: this.roomId,
    players: this.players.size,
    state: this.state,
  });

     if (this.canStartGame()) {
      await this.startMatch();
    }

  return { room: this, playerId: newPlayer.playerId };
}


  async removePlayer(player) {
    if (!player) return;

    if (this && !player.eliminated && this.state !== "waiting")
     player.eliminate();
    addEntryToKillfeed(this, 5, null, player.id, null);

    player.alive = false;
    player.eliminated = true;

    player.wsClose();
    playerLookup.delete(player.playerId);

    if (player.kills > 0 || player.damage > 0)
      UpdatePlayerKillsAndDamage(player);

    if (this.state === "waiting") {
      this.players.delete(player.playerId);

      process.send({
  type: "ROOM_UPDATE",
  roomId: this.roomId,
  players: this.players.size,
  state: this.state
});

      if (this.players.size < 1) {
        this.close();
        return;
      }
    } else {
      if (this.players.size < 1) {
        this.close();
        return;
      }

      if (this) {
        if (this.players.size > 1) {
          this.setRoomTimeout(() => {
            if (this) {
              this.players.delete(player.playerId);
              // optionally check if room is now empty
              if (this.players.size < 1) {
                this.close();
              }
            }
          }, 4000);
        } else {
          this.players.delete(player.playerId);
          if (this.players.size < 1) {
            this.close();
          }
        }
      }
    }
  }

  hasWinner() {
    return this.winner !== -1;
  }

  canStartGame() {
    return this.players.size >= this.maxplayers && this.state === "waiting";
  }

  update() {}

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
    clearTimeout(this.driftdelay1);
    clearTimeout(this.driftdelay2);

    this.intervalIds = [];
    this.timeoutIds = [];
  }

  // Clean up all players
  cleanupPlayers() {
    this.players.forEach((player) => {
      // Close player connection
      player.wsClose();


      // Update player stats if needed
      if (player.kills > 0 || player.damage > 0) {
        UpdatePlayerKillsAndDamage(player, player.kills, player.damage);
      }
    });
  }

  // Fully close the room
  close() {
    if (this.state === "closed") return;

      process.send({
  type: "ROOM_CLOSED",
  roomId: this.roomId
});

    console.log("close")
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

  clearAndRemoveInactiveTimers(timerArray, clearFn) {
    return timerArray.filter((timer) => {
      if (timer._destroyed || timer._idleTimeout === -1) {
        // Timer is already destroyed or no longer active
        clearFn(timer); // Clear the timeout or interval
        return false; // Remove from the array
      }
      return true; // Keep active timers
    });
  }

  clearAndRemoveCompletedTimeouts(timeoutArray, clearFn) {
    return timeoutArray.filter((timeout) => {
      if (
        timeout._destroyed ||
        timeout._idleTimeout === -1 ||
        timeout._called
      ) {
        // _called indicates that the timeout has already been executed (Node.js)
        clearFn(timeout);
        return false; // Remove from the array as it's completed or inactive
      }
      return true; // Keep active timeouts
    });
  }

  cleanupRoom(roomId) {
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
  }
}



  initIntervals() {
    // Idle player cleanup

  
  
     this.intervalIds.push(
      setInterval(() => {
        const now = Date.now();
        for (const player of this.players.values()) {
          if (
            player.lastPing <= now - player_idle_timeout ||
            !player.wsOpen()
          ) {
            player.wsClose(4200, "disconnected_inactivity");
          }
        }
      }, player_idle_timeout / 2)
    );
    // Cleanup expired intervals/timeouts
    this.xcleaninterval = setInterval(() => {
      if (this.timeoutIds) {
        this.timeoutIds = this.clearAndRemoveCompletedTimeouts(
          this.timeoutIds,
          clearTimeout
        );
      }
      if (this.intervalIds) {
        this.intervalIds = this.clearAndRemoveInactiveTimers(
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

  startGameLoop2(game_tick_rate) {
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
        const mspt =
          this._tickTimes.reduce((a, b) => a + b, 0) / this._tickTimes.length;
        const variance =
          this._tickTimes.reduce((a, b) => a + Math.pow(b - mspt, 2), 0) /
          this._tickTimes.length;
        const stddev = Math.sqrt(variance);
        console.log(
          `ms/tick: ${mspt.toFixed(2)} ± ${stddev.toFixed(2)} | Load: ${(
            (mspt / idealDt) *
            100
          ).toFixed(1)}%`
        );
        this._tickTimes.length = 0;
      }

      // Schedule next tick with drift compensation
      const delay = Math.max(0, idealDt - (Date.now() - now));
      this.driftdelay1 = setTimeout(tick, delay);
    };

    this.driftdelay2 = setTimeout(tick, idealDt);
  }

  HasGameEnded() {
  let remainingTeamsOrPlayers;
  if (this.IsTeamMode) {
    remainingTeamsOrPlayers = [...this.teams.values()].filter((team) =>
      team.players.some((player) => !player.eliminated)
    );
  } else {
    remainingTeamsOrPlayers = [...this.players.values()].filter(
      (p) => !p.eliminated
    );
  }

  // Check if a single winner remains.
  if (remainingTeamsOrPlayers.length === 1) {
    const winner = remainingTeamsOrPlayers[0];
    if (this.IsTeamMode && this.winner === -1) {
      this.winner = winner.id;
      winner.players.forEach((player) => {
        const p = player;
        p.place = 1;
         UpdatePlayerWins(p, 1);
        UpdatePlayerPlace(p, 1, this);
      });
    } else if (this.winner === -1) {
      this.winner = winner.id;
      winner.place = 1;
       UpdatePlayerWins(winner, 1);
      UpdatePlayerPlace(winner, 1, this);
    }
    // Set a timeout to close the room after a win.
     this.setRoomTimeout(() => {
        this.close(); 
    }, game_win_rest_time)
  }
  // If no one is left, also close the room.
  else if (remainingTeamsOrPlayers.length === 0) {
       this.setRoomTimeout(() => {
    this.close();
  }, game_win_rest_time);
}
  }


  // Game tick loop
  startGameLoop(game_tick_rate) {
    let nextTick = performance.now();
    const tickRateMs = game_tick_rate;

    const loop = () => {
      const now = performance.now();
      const drift = now - nextTick;

      // Run game logic
      preparePlayerPackets(this);
      this.timeoutdelaysending = setTimeout(() => {
        sendPlayerPackets(this);
      }, 5);

      // Schedule next frame compensating for drift
      nextTick += tickRateMs;

      const delay = Math.max(0, tickRateMs - drift);

      this.driftdelay1 = setTimeout(loop, delay);
    };

    nextTick = performance.now() + tickRateMs;
    this.driftdelay2 = setTimeout(loop, tickRateMs);
  }

  async startMatch() {
    this.state = "await";
    removeRoomFromIndex(this);

    process.send({
  type: "ROOM_LOCKED",
  roomId: this.roomId
});

    clearTimeout(this.matchmaketimeout);
    await startMatch(this, this.roomId);

  }
  
  // Cleanup cycle
 /* this.timeoutIds.push(
      setTimeout(() => {
        this.intervalIds.push(
          setInterval(() => {
            this.cleanupRoom(this);
          }, 1000)
        );
      }, 10000)
    );
  }

  */
    
}


function cloneGrid(original) {
  const clone = new GameGrid(
    original.width * original.cellSize,
    original.height * original.cellSize,
  );

  clone.nextId = original.nextId;

  // Clone objects
  for (const [gid, obj] of original.objects.entries()) {
    const objCopy = { ...obj }; // shallow copy
    clone.objects.set(gid, objCopy);
  }

  // Clone grid
  for (const [key, set] of original.grid.entries()) {
    clone.grid.set(key, new Set(set));
  }

   for (const [key, set] of original.wallGrid.entries()) {
    clone.wallGrid.set(key, new Set(set));
  }

  // Clone objectsCells
  for (const [gid, cells] of original.objectsCells.entries()) {
    clone.objectsCells.set(gid, new Set(cells));
  }

  return clone;
}




function cloneGrid2(original) {

  return original;
}


async function SetupRoomStartGameData(room) {
  room.grid = cloneGrid(room.mapdata.grid);
}

async function setupRoomPlayers(room) {
  let playerNumberID = 0; // Start with player number 0

  // Iterate over each player in the room's players collection
  room.players.forEach((player) => {
 
    player.id = playerNumberID;

    const spawnPositions = room.spawns;
    const spawnIndex = playerNumberID % spawnPositions.length; // Distribute players across spawn positions

    (player.x = spawnPositions[spawnIndex].x),
      (player.y = spawnPositions[spawnIndex].y),
      // Assign the spawn position to the player
      (player.startspawn = {
        x: spawnPositions[spawnIndex].x,
        y: spawnPositions[spawnIndex].y,
      });

    // Increment the player number for the next player
    playerNumberID++;

    room.grid.addObject(player);
  });
}

async function CreateTeams(room) {
    if (!room.players || room.players.size === 0) return;

    const teamIDs = ['Red', 'Blue', 'Green', 'Yellow', 'Cyan', 'Pink', 'Purple', 'Orange'];

    room.teams = new Map();

    let teamIndex = 0;
    room.players.forEach(player => {
        // Find or create the team.
        const teamId = teamIDs[teamIndex] || `Team-${teamIndex + 1}`;
        if (!room.teams.has(teamId)) {
            room.teams.set(teamId, {
                id: teamId,
                players: [],
                score: 0,
            });
        }
        const team = room.teams.get(teamId);

        // Add the player to the team.
        team.players.push({ playerId: player.playerId, id: player.id });
        player.teamId = teamId; // Use a simple reference to the team.

        // Advance to the next team if the current one is full.
        if (team.players.length >= room.teamsize) {
            teamIndex++;
        }
    });

    // Create a single teamdata object and assign it to all players.
    // This is more efficient than creating a separate object for each player.
    const teamDataMap = new Map();
    room.teams.forEach(team => {
        const teamMembers = team.players.map(p => p.id);
        teamDataMap.set(team.id, teamMembers);
    });

    // Assign the completed teamdata to each player.
    room.players.forEach(player => {
        const playerTeamId = player.teamId;
        const playerTeamMembers = teamDataMap.get(playerTeamId);
        player.teamdata = {
            id: playerTeamMembers, // Array of team members' IDs
            tid: playerTeamId,     // The player's team ID
        };
    });
}

function startCountdown(room) {
  const startTime = Date.now();
  room.countdownInterval = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const remaining = room_max_open_time  - elapsed;

    if (remaining <= 0) {
      clearInterval(room.countdownInterval);
      room.countdown = "0:00";
    } else {
      const minutes = Math.floor(remaining / 1000 / 60);
      const seconds = Math.floor((remaining / 1000) % 60);
      room.countdown = `${minutes}:${seconds.toString().padStart(2, "0")}`;
    }
  }, 1000);
}

async function startMatch(room, roomId) {
  try {
    // Automatically close the room after max open time
    room.maxopentimeout = room.setRoomTimeout(() => {
      room.close();
      if (room.gamemode !== "training") console.log("Warning: Room time limit reached forced closing on non training countdown mode")
    }, room_max_open_time);

    // Prepare room data and players
    await SetupRoomStartGameData(room);
    await setupRoomPlayers(room);
    await CreateTeams(room);

    // Render players and send pre-start message
    for (const player of room.players.values()) {
     player.updateView()
    }

   // playerchunkrenderer(room);
    SendPreStartMessage(room);

      room.setRoomTimeout(() => {

    // Countdown phase before the game starts
    room.state = "countdown";

    room.setRoomTimeout(() => {
      if (!rooms.has(roomId)) return; // Room might have been closed

      room.state = "playing";

      // Start countdown if the modifier is active
      if (room.modifiers.has("countdown")) {
        startCountdown(room);
      }

      // Initialize game modifiers
      if (room.modifiers.has("HealingCircles")) initializeHealingCircles(room);
      if (room.modifiers.has("UseZone")) UseZone(room);
      if (room.modifiers.has("AutoHealthRestore")) startRegeneratingHealth(room, 1);
      if (room.modifiers.has("AutoHealthDamage")) startDecreasingHealth(room, 1);

    }, game_start_time); // Delay before game officially starts

  }, 1000)
  } catch (err) {
    console.error(`Error starting match in room ${roomId}:`, err);
  }
}


module.exports = { 
  Room,
  rooms,
  playerLookup,
 roomIndex,
  addRoomToIndex,
  removeRoomFromIndex,
  GetRoom,
  startMatch
};
