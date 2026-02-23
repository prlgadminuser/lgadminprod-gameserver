const { GlobalRoomConfig } = require("../config/server");
const {
  UpdatePlayerKillsAndDamage,
  UpdatePlayerPlace,
  UpdatePlayerWins,
  UpdateEventKills,
} = require("../database/ChangePlayerStats");
const { BulletManager, BULLET_TICK_RATE } = require("../objects/bullets");
const { Player } = require("../objects/player");
const { deepCopy, generateUUID, arraysEqual } = require("../utils/hash");
const { random_mapkeys, mapsconfig } = require("../config/maps");
const { gadgetconfig } = require("../config/gadgets");
const {
  SkillbasedMatchmakingEnabled,
  roundSkillpointsToFloorBucket,
} = require("../config/matchmaking");
const { GameGrid } = require("../config/grid");
const { gamemodeconfig } = require("../config/gamemodes");
const { HandleAfflictions } = require("../objects/bullets-effects");
const {
  SerializePlayerData,
  BuildSelfData,
  compressMessage,
} = require("../utils/serialize");
const { encodePosition } = require("../utils/game");

const rooms = new Map();
const playerLookup = new Map();
const roomIndex = new Map();

const state_map = {
  waiting: 1,
  await: 2,
  countdown: 3,
  playing: 4,
};

const PacketKeys = {
  roomdata: 1,
  selfdata: 2,
  playerdata: 3,
  bulletdata: 4,
  objectupdates: 5,
  animations: 6,
  killfeed: 7,
};

function StartMatchmaking(ws, gamemode, playerVerified) {
  try {
    const max_length = 16;
    const min_length = 4;

    const playername = playerVerified.playername;
    const gadgetselected = playerVerified.gadget || 1;

    if (
      playername.length < min_length ||
      playername.length > max_length ||
      !(gadgetselected in gadgetconfig)
    ) {
      return ws.close(4004);
    }

    matchmaker.enqueue(ws, playerVerified, gamemode);
  } catch (error) {
    console.error("Error matchmaking:", error);
    ws.close(4000);
  }

  return true;
}

class Matchmaker {
  constructor() {
    this.queues = new Map();
    // key => {
    //   players: Set<entry>,
    //   maxplayers: number,
    //   locked: boolean
    // }
  }

  getQueueKey(gamemode, spLevel) {
    return `${gamemode}_${spLevel}`;
  }

  enqueue(ws, playerVerified, gamemode) {
    if (ws.__inQueue) return; // prevent double enqueue

    const sp = SkillbasedMatchmakingEnabled ? playerVerified.skillpoints : 0;

    const spLevel = roundSkillpointsToFloorBucket(sp);
    const key = this.getQueueKey(gamemode, spLevel);
    const gmconfig = gamemodeconfig.get(gamemode);

    if (!gmconfig) {
      ws.close(4004, "invalid_gamemode");
      return;
    }

    if (!this.queues.has(key)) {
      this.queues.set(key, {
        players: new Set(),
        maxplayers: gmconfig.maxplayers,
        locked: false,
      });
    }

    const queue = this.queues.get(key);

    const entry = { ws, playerVerified, key };

    queue.players.add(entry);

    ws.__inQueue = true;
    ws.__queueKey = key;
    ws.__queueEntry = entry;

    ws.on("close", () => this.removeFromQueue(ws));
    ws.on("error", () => this.removeFromQueue(ws));

    this.sendQueueUpdate(queue);

    this.tryCreateRoom(key, gamemode, gmconfig, spLevel);
  }

  removeFromQueue(ws) {
    if (!ws.__inQueue) return;

    const key = ws.__queueKey;
    const entry = ws.__queueEntry;

    const queue = this.queues.get(key);
    if (!queue) return;

    queue.players.delete(entry);

    ws.__inQueue = false;
    ws.__queueKey = null;
    ws.__queueEntry = null;

    if (queue.players.size === 0) {
      this.queues.delete(key);
      return;
    }

    this.sendQueueUpdate(queue);
  }

  sendQueueUpdate(queue) {
    const size = queue.players.size;
    const max = queue.maxplayers;

    const packet = compressMessage([PacketKeys["roomdata"], [1, max, size]]);
    // PacketKeys.roomdata = 1
    // state_map.waiting = 1

    for (const entry of queue.players) {
      if (entry.ws.readyState === entry.ws.OPEN) {
        try {
          entry.ws.send(packet);
        } catch {}
      }
    }
  }

  tryCreateRoom(key, gamemode, gmconfig, spLevel) {
    const queue = this.queues.get(key);
    if (!queue) return;

    if (queue.locked) return;
    if (queue.players.size < queue.maxplayers) return;

    queue.locked = true;

    const alive = [...queue.players].filter(
      (e) => e.ws.readyState === e.ws.OPEN,
    );

    /*
    if (alive.length < queue.maxplayers) {
      queue.players = new Set(alive);
      queue.locked = false;
      return;
    }

    */

    const selected = alive.slice(0, queue.maxplayers);

    const roomId = generateUUID();
    const room = new Room(roomId, gamemode, gmconfig, spLevel);

    for (const entry of selected) {
      this.removeFromQueue(entry.ws);
      room.addPlayer(entry.ws, entry.playerVerified);
    }

    this.queues.delete(key);

    room.startMatch();
  }
}

const matchmaker = new Matchmaker();

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

    this.lastEliminatedPlayer = false;
    this.lastEliminatedTeam = false;

    // Core room state
    this.allplayerkillscount = 0;
    this.roomId = roomId;
    this.state = "waiting";
    this.sp_level = splevel;
    this.maxplayers = gmconfig.maxplayers;
    this.gamemode = gamemode;
    this.IsTeamMode = gmconfig.teamsize > 1;
    this.matchtype = gmconfig.matchtype;

    this.alivePlayers = new Set();
    this.connectedPlayers = new Set();

    this.aliveTeams = 0;

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
    this.bulletUpdateTick = 1;
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
    this.bulletUpdatesTick = 20
    this.playerDataBuffer = new Map();
    this.intervalIds = [];
    this.timeoutIds = [];
    this.lastglobalping = 0;

    // Register room globally
    rooms.set(roomId, this);

    // Setup timers/intervals
    this.initIntervals();
  }

  addPlayer(ws, playerVerified) {
    const newPlayer = new Player(ws, playerVerified, this);

    playerLookup.set(newPlayer.playerId, newPlayer);
    this.connectedPlayers.add(newPlayer);
    this.alivePlayers.add(newPlayer);

    ws.player = newPlayer;
    ws.room = this;
  }

  removePlayer(player) {
    if (!player) return;

    if (this && !player.eliminated && this.state !== "waiting")
      player.eliminate();

    player.alive = false;
    player.eliminated = true;

    this.connectedPlayers.delete(player);
    this.alivePlayers.delete(player);

    player.wsClose();
    playerLookup.delete(player.playerId);

    if (player.kills > 0 || player.damage > 0)
      UpdatePlayerKillsAndDamage(player);

    if (this.connectedPlayers.size < 1) {
      this.close();
      return;
    }
  }
  //update() {}

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
    for (const player of this.connectedPlayers) {
      // Close player connection
      player.wsClose();

      // Update player stats if needed
      if (player.kills > 0 || player.damage > 0) {
        UpdatePlayerKillsAndDamage(player, player.kills, player.damage);
      }
    }
  }

  // Fully close the room
  close() {
    if (this.state === "closed") return;

    UpdateEventKills(this.allplayerkillscount);

    // Stop timers
    this.clearTimers();

    // Cleanup players
    this.cleanupPlayers();
    this.connectedPlayers.clear();
    this.alivePlayers.clear();

    // Remove from global registries
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

  initIntervals() {
    // Idle player cleanup
    // Cleanup expired intervals/timeouts
    this.xcleaninterval = setInterval(() => {
      if (this.timeoutIds) {
        this.timeoutIds = this.clearAndRemoveCompletedTimeouts(
          this.timeoutIds,
          clearTimeout,
        );
      }
      if (this.intervalIds) {
        this.intervalIds = this.clearAndRemoveInactiveTimers(
          this.intervalIds,
          clearInterval,
        );
      }
    }, 10000);

    this.startGameLoop(GlobalRoomConfig.room_tick_rate_ms);
  }

  hasWinner() {
    return this.winner !== -1;
  }

  canStartGame() {
    return (
      this.state === "waiting" && this.connectedPlayers.size >= this.maxplayers
    );
  }

  HasGameEnded() {
    let remaining;

    if (this.IsTeamMode) {
      remaining = [...this.teams.values()].filter(
        (team) => team.aliveCount > 0,
      );
    } else {
      remaining = this.alivePlayers; // Set
    }

    const remainingCount = this.IsTeamMode ? remaining.length : remaining.size;

    if (2 > remainingCount && this.winner === -1) {
      this.OnlyAllowEmoteAllPlayers = true;
      for (const player of this.connectedPlayers) {
        player.moving = false;
      }

      let winner;

      if (this.IsTeamMode) {
        winner = remaining[0] || this.lastEliminatedTeam;

        if (!winner) return;
        this.winner = winner.id;

        for (const player of winner.players) {
          player.place = 1;
          UpdatePlayerWins(player, 1);
          UpdatePlayerPlace(player, 1, this);
        }
      } else {
        winner = [...remaining][0] || this.lastEliminatedPlayer; // extract from Set

        if (!winner) return;
        this.winner = winner.id;

        winner.place = 1;
        UpdatePlayerWins(winner, 1);
        UpdatePlayerPlace(winner, 1, this);
      }

      this.setRoomTimeout(() => {
        this.close();
      }, GlobalRoomConfig.game_win_rest_time);
    }

    if (remainingCount === 0) {
      // if no players connected close immediately, if the last 2 players are eliminated at the same time then there is a winner so wait the rest time
      this.setRoomTimeout(
        () => {
          this.close();
        },
        this.connectedPlayers.size === 0
          ? 0
          : GlobalRoomConfig.game_win_rest_time,
      );
    }
  }

  SendPreStartPacket() {
    // Prebuild AllPlayerData

    const players = this.alivePlayers;

    const dummiesFiltered = this.dummies ? this.dummies : undefined;

    const RoomData = {
      mapid: this.map,
      type: this.matchtype,
      modifiers: Array.from(this.modifiers), // set needs array converting
      sb: this.scoreboard,
      mapdata: this.mapdata.compressedwalls,
    };

    const AllData = {};

    for (const p of players) {
      AllData[p.id] = [
        p.hat || 0,
        p.top || 0,
        p.player_color,
        p.hat_color,
        p.top_color,
        p.playername,
        p.starthealth,
      ];
    }

    for (const p of players) {
      const self_info = {
        id: p.id,
        state: p.state,
        h: p.health,
        sh: p.starthealth,
        s: +p.shooting,
        g: p.gun,
        kil: p.kills,
        dmg: p.damage,
        rwds: p.finalrewards,
        killer: p.eliminator,
        cg: +p.canusegadget,
        lg: p.gadgetuselimit,
        ag: +p.gadgetactive,
        x: encodePosition(p.x),
        y: encodePosition(p.y),
        el: p.eliminations,
        em: p.emote,
        spc: p.spectatingPlayerId,
        guns: p.loadout_formatted,
        ht: [],
      };

      p.selflastmsg = self_info;

      const MessageToSend = {
        AllData,
        SelfData: {
          allies: p.team.players.map((p) => p.id),
          teamid: p.team.id,
          pid: p.id,
          self_info,
          dummies: dummiesFiltered,
          gadget: p.gadgetid,
        },
        RoomData: RoomData,
      };

      p.send(compressMessage(MessageToSend), { binary: true });
    }
  }

  update() {
    const CachedEmptyMsg = compressMessage([]);

    const players = this.connectedPlayers;

    const aliveCount = this.alivePlayers.size;

     this.bulletManager.update(); 

    HandleAfflictions(this);

    for (const player of players) {
      if (player.alive && player.moving) player.update();

      player.updateView();
      
     if (player.spectating) player.updateSpectatorMode();
    }

    // ROOM DATA
    const roomdata = [
      state_map[this.state],
      this.maxplayers,
      aliveCount,
      this.countdown,
      this.winner,
      this.zone,
    ];

    let finalroomdata;

    if (!arraysEqual(this.rdlast, roomdata)) {
      finalroomdata = roomdata;
      this.rdlast = roomdata;
    } else {
      finalroomdata = undefined;
    }

    // Reuse buffers for bullets and player data
    const playerData = this.playerDataBuffer;

    for (const p of players) {

      if (!p.alive || p.spectating) continue;


     if (p.dirty) playerData.set(p.id, SerializePlayerData(p));
    }

    // ONE PASS: build messages
    for (const p of players) {
      if (!p.wsReadyState()) continue;

      const selfdata = BuildSelfData(p);

      const changes = {};
      const lastSelf = p.selflastmsg;
      for (const k in selfdata) {
        if (selfdata[k] !== lastSelf[k]) changes[k] = selfdata[k];
      }
      
      if (Object.keys(changes).length)
        p.selflastmsg = { ...lastSelf, ...changes };

        const filteredPlayers = p.filteredPlayersBuffer;

        filteredPlayers.length = 0;

        for (const player of p.nearbyplayers) {
          if (player.dirty || !p.nearbyplayersidslast.includes(player.id)) {
            const data = playerData.get(player.id);
            if (data) filteredPlayers.push(data); // if data is dirty or playerid is new from last tick then sent
          }
        


        p.pd = filteredPlayers;
        p.nearbyplayersidslast = p.nearbyplayersids;
      }

      // --- Message assembly with buffer reuse ---
      const msgArray = p.msgBuffer;
      msgArray.length = 0;

      const dataSource = p;

      // always send also for spectators
      if (finalroomdata) msgArray.push(PacketKeys["roomdata"], finalroomdata);
      if (Object.keys(changes).length)
        msgArray.push(PacketKeys["selfdata"], changes);
      if (p.newSeenObjectsStatic)
        msgArray.push(PacketKeys["objectupdates"], p.newSeenObjectsStatic);
      if (this.killfeed.length)
        msgArray.push(PacketKeys["killfeed"], this.killfeed);

      // for normal players and spectator handling
      if (dataSource.nearbyanimations.length)
        msgArray.push(PacketKeys["animations"], dataSource.nearbyanimations);
      if (dataSource.finalbullets)
        msgArray.push(PacketKeys["bulletdata"], dataSource.finalbullets);
      if (p.pd) msgArray.push(PacketKeys["playerdata"], p.pd);

      // Send message if changed
      if (!msgArray.length) {
        if (!p.emptySent) {
          p.lastcompressedmessage = CachedEmptyMsg;
          p.tick_send_allow = true;
          p.emptySent = true;
        } else {
          p.tick_send_allow = false;
        }
      } else {
        const compressed = compressMessage(msgArray);
        p.lastcompressedmessage = compressed;
        p.lastnotemptymessage = compressed;
        p.tick_send_allow = true;
        p.emptySent = false;
      }
    }

    // CLEANUP
  
    for (const p of players) {
      p.hitmarkers.length = 0;
      p.eliminations.length = 0;
      p.nearbyanimations.length = 0;

      // remove dirty
      p.dirty = false

    }

      this.gamedata_dirty = false
      this.killfeed.length = 0;

    if (
      this.state === "playing" &&
      this.maxplayers > 1 &&
      this.maxplayers !== this.teamsize
    )
      this.HasGameEnded();
  }

  sendPlayerPackets() {
    for (const player of this.connectedPlayers) {
      if (player.tick_send_allow) {
        player.send(player.lastcompressedmessage, { binary: true });
      }
    }
  }

  startMatch() {
    this.state = "await";
    clearTimeout(this.matchmaketimeout);
    startMatch(this, this.roomId);
  }

  // Game tick loop
  startGameLoop2(tickRateMs) {
    let nextTick = performance.now() + tickRateMs;

    const loop = () => {
      const now = performance.now();

      // Catch up if we're behind
      while (now >= nextTick) {
        // --- GAME LOGIC ---
        this.update(); // your game world, physics, collisions, etc.

        // Advance to next tick
        nextTick += tickRateMs;
      }

      // Send packets once per tick
      this.sendPlayerPackets();

      // Calculate delay until next tick
      const delay = Math.max(0, nextTick - performance.now());
      this.loopHandle = setTimeout(loop, delay);
    };

    // Start the loop
    this.loopHandle = setTimeout(loop, tickRateMs);
  }

  startGameLoop(game_tick_rate) {
    let nextTick = performance.now();
    const tickRateMs = game_tick_rate;

    const loop = () => {
      const now = performance.now();
      const drift = now - nextTick;

      // Run game logic
      this.update();
      //  this.timeoutdelaysending = setTimeout(() => {
      this.sendPlayerPackets();
      // }, 5);

      // Schedule next frame compensating for drift
      nextTick += tickRateMs;

      const delay = Math.max(0, tickRateMs - drift);

      this.driftdelay1 = setTimeout(loop, delay);
    };

    nextTick = performance.now() + tickRateMs;
    this.driftdelay2 = setTimeout(loop, tickRateMs);
  }
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
  // Clone objectsCells
  for (const [gid, cells] of original.objectsCells.entries()) {
    clone.objectsCells.set(gid, new Set(cells));
  }

  return clone;
}

async function setupRoomPlayers(room) {
  let playerNumberID = 0; // Start with player number 0

  // Iterate over each player in the room's players collection
  for (const player of room.connectedPlayers) {
    player.id = playerNumberID;

    const spawnPositions = room.spawns;
    const spawnIndex = playerNumberID % spawnPositions.length; // Distribute players across spawn positions

    player.x = spawnPositions[spawnIndex].x,
      player.y = spawnPositions[spawnIndex].y,
      // Assign the spawn position to the player
      player.startspawn = {
        x: spawnPositions[spawnIndex].x,
        y: spawnPositions[spawnIndex].y,
      };

    // Increment the player number for the next player
    playerNumberID++;

    room.grid.addObject(player);
  }
}

async function CreateTeams(room) {
  if (!room?.connectedPlayers?.size) return;

  const teamIDs = [
    "Red",
    "Blue",
    "Green",
    "Yellow",
    "Cyan",
    "Pink",
    "Purple",
    "Orange",
  ];

  room.teams = new Map();

  let teamIndex = 0;
  let ThisIndexTeamCreated = false;

  for (const player of room.connectedPlayers) {
    const teamId = teamIDs[teamIndex] || `Team-${teamIndex + 1}`;

    if (!ThisIndexTeamCreated) {
      team = {
        id: teamId,
        players: [],
        score: 0,
        aliveCount: 0,
      };

      room.teams.set(teamId, team);
      room.aliveTeams++;

      ThisIndexTeamCreated = true;
    }

    // bind both ways
    team.players.push(player);
    team.aliveCount++;

    player.team = team;

    if (team.players.length >= room.teamsize) {
      teamIndex++;
      ThisIndexTeamCreated = false;
    }
  }
}

function startCountdown(room) {
  const startTime = Date.now();
  room.countdownInterval = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const remaining = GlobalRoomConfig.room_max_open_time - elapsed;

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

const { UseZone } = require("../modifiers/zone");
const {
  startDecreasingHealth,
  startRegeneratingHealth,
} = require("../modifiers/modifiers");
const { initializeHealingCircles } = require("../modifiers/healingcircle");

//const modifierHandlers = { startCountdown, initializeHealingCircles, UseZone, AutoHealthRestore, AutoHealthDamage};

async function SetupRoomStartGameData(room) {
  // const mapData = room.mapdata
  room.grid = cloneGrid(room.mapdata.grid); /* = new GameGrid(
      mapData.width,
      mapData.height,
      mapData.cellSize,
    );

    */

  // for (const wall of mapData.walls) {
  //    room.grid.addObject({ ...wall });
  //  }
}

function startMatch(room, roomId) {
  try {
    // Automatically close the room after max open time
    room.maxopentimeout = room.setRoomTimeout(() => {
      room.close();
      if (room.gamemode !== "training")
        console.log(
          "Warning: Room time limit reached forced closing on non training countdown mode",
        );
    }, GlobalRoomConfig.room_max_open_time);

    // Prepare room data and players
    SetupRoomStartGameData(room);
    setupRoomPlayers(room);
    CreateTeams(room);

    // Render players and send pre-start message
    for (const player of room.connectedPlayers) {
      player.updateView();
    }

    // playerchunkrenderer(room);
    room.SendPreStartPacket();

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

        // for (const modifier of room.modifiers) {
        // const handler = modifierHandlers[modifier];
        // if (handler) {
        //   handler(room);
        // }
        // }
        // Initialize game modifiers
        if (room.modifiers.has("HealingCircles"))
          initializeHealingCircles(room);
        if (room.modifiers.has("UseZone")) UseZone(room);
        if (room.modifiers.has("AutoHealthRestore"))
          startRegeneratingHealth(room, 1);
        if (room.modifiers.has("AutoHealthDamage"))
          startDecreasingHealth(room, 1);
      }, GlobalRoomConfig.game_start_delay); // Delay before game officially starts
    }, 1000);
  } catch (err) {
    console.error(`Error starting match in room ${roomId}:`, err);
  }
}

module.exports = {
  Room,
  rooms,
  playerLookup,
  roomIndex,
  StartMatchmaking,
  startMatch,
  matchmaker,
};
