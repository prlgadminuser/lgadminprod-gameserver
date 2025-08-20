const { Limiter, compressMessage } = require("./..//index.js");
const {
  matchmaking_timeout,
  server_tick_rate,
  game_start_time,
  mapsconfig,
  random_mapkeys,
  gunsconfig,
  gamemodeconfig,
  matchmakingsp,
  player_idle_timeout,
  room_max_open_time,
} = require("./config.js");
const { SkillbasedMatchmakingEnabled } = require("./../gameconfig/matchmaking");
const { handleBulletFired, BulletManager } = require("./bullets.js");
const { HandleAfflictions } = require("./bullets-effects");
const { handleMovement } = require("./player.js");
const {
  startRegeneratingHealth,
  startDecreasingHealth,
} = require("./match-modifiers");
const { gadgetconfig } = require("./gadgets.js");
const { UseZone } = require("./zone");
const {
  initializeHealingCircles,
} = require("./../gameObjectEvents/healingcircle");
const { initializeAnimations } = require("./../gameObjectEvents/deathrespawn");
const { playerchunkrenderer } = require("./../playerhandler/playerchunks");
const { handleSpectatorMode } = require("./../playerhandler/spectating");
const {
  SpatialGrid,
  RealTimeObjectGrid,
  gridcellsize,
} = require("./config.js");
const { increasePlayerKillsAndDamage } = require("./dbrequests.js");
const {
  roomIndex,
  rooms,
  closeRoom,
  addRoomToIndex,
  getAvailableRoom,
} = require("./../roomhandler/manager");

function generateUUID() {
  return "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8; // Ensures UUID version 4
    return v.toString(16);
  });
}

//

function generateHash(message) {
  let hash = 2166136261;
  for (let i = 0; i < message.length; i++) {
    let val = message[i];
    if (typeof val === "string") {
      for (let j = 0; j < val.length; j++) {
        hash ^= val.charCodeAt(j);
        hash = (hash * 16777619) >>> 0;
      }
    } else {
      hash ^= val;
      hash = (hash * 16777619) >>> 0;
    }
  }
  return hash >>> 0;
}

function generateHash2(message) {
  let hash = 0;
  const str = JSON.stringify(message);
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  return hash;
}

function stringHash(str) {
  if (typeof str !== "string") str = String(str);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  return hash;
}

// A recursive function to hash objects and arrays directly.
// This is the core of the optimization that replaces JSON.stringify.
function deepHash(value, visited = new WeakSet()) {
  if (value === null || typeof value !== "object") {
    // Handle primitives: null, undefined, strings, numbers, booleans
    return stringHash(value);
  }

  if (visited.has(value)) {
    // Handle circular references to prevent infinite loops
    return stringHash("[Circular]");
  }
  visited.add(value);

  let hash = 0;

  if (Array.isArray(value)) {
    // Hash arrays by hashing each element
    for (const item of value) {
      hash ^= deepHash(item, visited);
    }
  } else {
    // Hash objects by hashing each key and value
    // CRUCIAL: Sort the keys to ensure a consistent hash regardless of key order
    const keys = Object.keys(value).sort();
    for (const key of keys) {
      hash ^= stringHash(key);
      hash ^= deepHash(value[key], visited);
    }
  }

  visited.delete(value); // Clean up for the next call

  return hash;
}

//function generateHash(message) {
// const str = JSON.stringify(message);
// return murmurHash3.x86.hash32(str); // Use a standard, tested algorithm
//}

function getDistance(x1, y1, x2, y2) {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

function deepCopy(obj) {
  return JSON.parse(JSON.stringify(obj));
}

//function cloneSpatialGrid(originalGrid) {
//  const clone = new SpatialGrid(originalGrid.cellSize);

// Directly copy the Map. This is a shallow copy of the grid structure.
// The Maps for each cell and the objects within them are shared references.
// This is safe because walls are static.
//clone.grid = new Map(originalGrid.grid);

//return clone;
//}

function cloneSpatialGrid2(original) {
  clone = new SpatialGrid(original.cellSize);
  clone.grid = new Map(original.grid);

  return clone;
}

function cloneSpatialGrid(original) {
  const clone = new SpatialGrid(original.cellSize);

  for (const [key, obj] of original.grid.entries()) {
    // Store a shallow copy so modifications don't affect the original
    clone.grid.set(key, { ...obj });
  }

  return clone;
}

function createRateLimiter() {
  const rate = 20; // Allow one request every 50 milliseconds
  return new Limiter({
    tokensPerInterval: rate,
    interval: 1000, // milliseconds
  });
}

async function setupRoomPlayers(room) {
  let playerNumberID = 0; // Start with player number 0

  // Iterate over each player in the room's players collection
  room.players.forEach((player) => {
    // Set the player's unique number (nmb)
    player.nmb = playerNumberID;

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

    room.realtimegrid.addObject(player);
  });
}

async function CreateTeams(room) {
  if (!room.players || room.players.size === 0) return;

  // Define team IDs
  const teamIDs = [
    "The Tough Shells",
    "The Jet Setters",
    "The Highnotes",
    "Yellow",
    "Orange",
    "Purple",
    "Pink",
    "Cyan",
  ];

  let numTeams;
  if (room.teamsize === 1) {
    numTeams = room.players.size;
  } else {
    numTeams = Math.ceil(room.players.size / room.teamsize);
  }

  const teams = Array.from({ length: numTeams }, () => []);

  let teamIndex = 0;

  // Step 1: Assign players to teams
  room.players.forEach((player) => {
    if (teams[teamIndex].length >= room.teamsize) {
      teamIndex = (teamIndex + 1) % numTeams;
    }
    teams[teamIndex].push({ playerId: player.playerId, nmb: player.nmb });
    player.team = {
      id: teamIDs[teamIndex] || `Team-${teamIndex + 1}`,
      players: teams[teamIndex], // Reference to team
    };
  });

  // Step 2: Finalize room.teams
  room.teams = teams.map((team, index) => ({
    id: teamIDs[index] || `Team-${index + 1}`,
    players: team,
    score: 0,
  }));

  // Step 3: Assign complete teamdata to each player
  room.players.forEach((player) => {
    const team = player.team; // Get the player's team
    const playerIds = Object.fromEntries(
      team.players.map((p) => [p.nmb, p.nmb]) // Extract all player IDs in the team
    );

    player.teamdata = {
      id: playerIds, // Complete team member IDs
      tid: team.id, // Team ID
    };
  });
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

function RemoveRoomPlayer(room, player, type) {
  player.timeoutIds?.forEach(clearTimeout);
  player.intervalIds?.forEach(clearInterval);

  try {
    player.wsClose();
  } catch {}
  player.nearbyids?.clear();
  player.nearbyplayers = [];

  if (player.kills > 0 || player.damage > 0)
    increasePlayerKillsAndDamage(player, player.kills, player.damage);

  try {
    player.wsClose();
  } catch (e) {
    // ignore errors or log if necessary
  }

  //  addKillToKillfeed(room, 5, null, player.nmb, null);
  room.players.delete(player.playerId);
}

function setRoomTimeout(room, fn, ms) {
  const id = setTimeout(fn, ms);
  room.timeoutIds.push(id);
  return id;
}

function setRoomInterval(room, fn, ms) {
  const id = setInterval(fn, ms);
  room.intervalIds.push(id);
  return id;
}

async function SetupRoomStartGameData(room) {
  room.itemgrid = new SpatialGrid(gridcellsize); // grid system for items
  room.realtimegrid = new RealTimeObjectGrid(200);
  room.bulletgrid = new RealTimeObjectGrid(200);

  room.grid = cloneSpatialGrid(room.mapdata.grid);
}

function createRoom(roomId, gamemode, gmconfig, splevel) {
  //splevel comes from the first players skillpoints number in the room
  let mapid;
  if (gmconfig.custom_map) {
    mapid = `${gmconfig.custom_map}`;
  } else {
    const randomIndex = Math.floor(Math.random() * random_mapkeys.length);
    mapid = random_mapkeys[randomIndex];
  }

  const mapdata = mapsconfig.get(mapid);

  if (!mapdata) console.error("map does not exist");

  const room = {
    // Game State
    roomId: roomId,
    state: "waiting",
    sp_level: splevel,
    maxplayers: gmconfig.maxplayers,
    gamemode: gamemode,
    matchtype: gmconfig.matchtype,
    players: new Map(),
    eliminatedTeams: [],
    currentplayerid: 0, // for creating playerids start at 0

    killfeed: [],
    objects: [],

    winner: -1,
    countdown: 0,

    // bullets handler
    bullets: new Map(),
    activeAfflictions: [],

    // Game Configuration
    modifiers: gmconfig.modifiers,
    respawns: gmconfig.respawns_allowed,
    place_counts: gmconfig.placereward,
    ss_counts: gmconfig.seasoncoinsreward,
    teamsize: gmconfig.teamsize,
    weapons_modifiers_override: gmconfig.weapons_modifiers_override,

    // Map Configuration
    mapdata: mapdata,
    map: mapid,
    mapHeight: mapdata.height,
    mapWidth: mapdata.width,
    spawns: mapdata.spawns,
    walls: mapdata.walls, // Could be mapped differently if needed
    zoneStartX: -mapdata.width,
    zoneStartY: -mapdata.height,
    zoneEndX: mapdata.width,
    zoneEndY: mapdata.height,
    zone: 0,

    // Destruction
    destroyedWalls: [],

    // clear interval ids
    intervalIds: [],
    timeoutIds: [],
  };

  if (gmconfig.can_hit_dummies && mapdata.dummies) {
    room.dummies = deepCopy(mapdata.dummies); //dummy crash fix
  }

  const roomConfig = {
    canCollideWithDummies: gmconfig.can_hit_dummies, // Disable collision with dummies
    canCollideWithPlayers: gmconfig.can_hit_players, // Enable collision with players
  };

  room.config = roomConfig;

  room.bulletManager = new BulletManager(room);

  addRoomToIndex(room);
  rooms.set(roomId, room);

  room.intervalIds.push(
    setInterval(() => {
      const now = Date.now();

      for (const player of room.players.values()) {
        if (player.lastPing <= now - player_idle_timeout) {
          player.wsClose(4200, "disconnected_inactivity");
        }
      }
    }, player_idle_timeout / 2)
  );

  room.xcleaninterval = setInterval(() => {
    if (room) {
      // Clear room's timeout and interval arrays
      if (room.timeoutIds) {
        room.timeoutIds = clearAndRemoveCompletedTimeouts(
          room.timeoutIds,
          clearTimeout
        );
      }
      if (room.intervalIds) {
        room.intervalIds = clearAndRemoveInactiveTimers(
          room.intervalIds,
          clearInterval
        );
      }

      // Clear player-specific timeouts and intervals
      room.players.forEach((player) => {
        if (player.timeoutIds) {
          player.timeoutIds = clearAndRemoveCompletedTimeouts(
            player.timeoutIds,
            clearTimeout
          );
        }
        if (player.intervalIds) {
          player.intervalIds = clearAndRemoveInactiveTimers(
            player.intervalIds,
            clearInterval
          );
        }
      });
    }
  }, 5000);

  room.matchmaketimeout = setTimeout(() => {
    room.players.forEach((player) => {
      player.send("matchmaking_timeout");
    });

    closeRoom(roomId);
  }, matchmaking_timeout);

  // Start sending batched messages at regular intervals
  // in ms
  room.intervalIds.push(
    setInterval(() => {
      room.bulletManager.update();
      // this could take some time...
      prepareRoomMessages(room);

      setTimeout(() => {
        sendRoomMessages(room);
      }, 4);
    }, server_tick_rate)
  );

  // room.intervalId = intervalId;
  room.timeoutIds.push(
    setTimeout(() => {
      room.intervalIds.push(
        setInterval(() => {
          if (room) {
            cleanupRoom(room);
          }
        }, 1000)
      );
    }, 10000)
  );

  // Countdown timer update every second

  // console.log("Room", room.roomId, "created")
  return room;
}

async function joinRoom(ws, gamemode, playerVerified) {
  try {
    const {
      playerId,
      nickname,
      hat,
      top,
      player_color,
      hat_color,
      top_color,
      gadget,
      skillpoints,
      loadout,
    } = playerVerified;

    //const fallbackloadout = { 1: "1", 2: "5", 3: "DEVLOCKED" }
    if (playerVerified.length > 200) {
      return ws.close(4004);
    }

    const max_length = 16;
    const min_length = 4;
    const gadgetselected = gadget || 1;
    const fallbackloadout = { 1: "1", 2: "2", 3: "3" };
    const finalskillpoints = SkillbasedMatchmakingEnabled ? skillpoints || 0 : 0;

    if (
      nickname.length < min_length ||
      nickname.length > max_length ||
      !gadgetconfig.has(`${gadgetselected}`)
    ) {
      return ws.close(4004);
    }

    const NICKNAME_SANITIZE = /[:$]/g;
    const finalnickname = nickname.replace(NICKNAME_SANITIZE, "");

    const roomjoiningvalue = matchmakingsp(finalskillpoints);

    let roomId, room;

    // Check if there's an existing room with available slots
    const availableRoom = getAvailableRoom(gamemode, roomjoiningvalue);

    const gamemodeSettings = gamemodeconfig.get(gamemode);

    if (availableRoom) {
      roomId = availableRoom.roomId;
      room = availableRoom;
    } else {
      roomId = generateUUID();
      room = createRoom(roomId, gamemode, gamemodeSettings, roomjoiningvalue);
    }

    const playerRateLimiter = createRateLimiter();

    const gadgetdata = gadgetconfig.get(`${gadgetselected}`);

    const newPlayer = {
      // player cosmetics appearance
      isPlayer: true,
      playerId: playerId,
      nickname: finalnickname,
      hat: hat,
      top: top,
      player_color: player_color,
      hat_color: hat_color,
      top_color: top_color,

      // game state
      health: gamemodeSettings.playerhealth,
      starthealth: gamemodeSettings.playerhealth,
      speed: gamemodeSettings.playerspeed,
      startspeed: gamemodeSettings.playerspeed,
      damage: 0,
      kills: 0,
      place: null,
      state: 1,
      eliminated: false,
      alive: true,
      finalrewards_awarded: false,
      respawns: room.respawns,
      emote: 0,
      // combat shooting

      lastShootTime: 0,
      shooting: false,
      shoot_direction: 90,
      hitmarkers: [],
      eliminations: [],
      nearbyanimations: [],
      can_bullets_bounce: false,
      nearbyids: new Set(),
      nearbyplayers: new Set(),
      nearbyfinalids: [],
      // movement
      moving: false,
      direction: null,
      direction2: 90,
      moveInterval: null,

      //loadout and gadgets
      loadout: loadout || fallbackloadout,
      loadout_formatted: [loadout[1], loadout[2], loadout[3]].join("$"),
      gadgetid: gadgetselected,
      canusegadget: true,
      gadgetactive: false,
      gadgetcooldown: gadgetdata.cooldown,
      gadgetuselimit: gadgetdata.use_limit,
      gadgetchangevars: gadgetdata.changevariables,

      // network
      wsClose: (code, msg) => ws.close(code, msg),
      send: (msg) => {
        if (ws.readyState === ws.OPEN) ws.send(msg);
      },
      wsReadyState: () => ws.readyState,

      lastPing: Date.now(),
      lastmsg: 0,
      rateLimiter: playerRateLimiter,
      intervalIds: [],
      timeoutIds: [],

      // spectating
      spectating: false,
      spectatingPlayer: playerId,
      spectateid: 0,
      spectatingTarget: null,
      spectatingPlayerId: -1,

      //final rewards
      finalrewards: [],

      usegadget(player) {
        if (player && room.state === "playing" && player.alive) {
          gadgetdata.gadget(player, room);
        } else {
          console.error("Player not found or cannot use gadget");
        }
      },
    };

    newPlayer.gun = newPlayer.loadout[1];

    if (newPlayer.gadgetchangevars) {
      for (const [variable, change] of Object.entries(
        newPlayer.gadgetchangevars
      )) {
        newPlayer[variable] += Math.round(newPlayer[variable] * change);
      }
    }

    if (room) {
      if (room.state !== "waiting" || room.players.size >= room.maxplayers)
        return;

      room.players.set(playerId, newPlayer);

      if (newPlayer.wsReadyState() === ws.CLOSED) {
        RemoveRoomPlayer(room, newPlayer);
        return;
      }
    }

    if (room.players.size >= room.maxplayers && room.state === "waiting") {
      const allAlive = Array.from(room.players.values()).every(
        (p) => p.wsReadyState() === ws.OPEN
      );

      if (!allAlive) return;

      if (room.state !== "waiting") return;
      room.state = "await";
      clearTimeout(room.matchmaketimeout);
      await startMatch(room, roomId);
    }

    return { roomId, playerId, room };
  } catch (error) {
    console.error("Error joining room:", error);
    ws.close(4000, "Error joining room");
    throw error;
  }
}

async function startMatch(room, roomId) {
  room.maxopentimeout = setTimeout(() => {
    closeRoom(roomId);
  }, room_max_open_time);

  await SetupRoomStartGameData(room);

  await setupRoomPlayers(room);
  await CreateTeams(room);

  playerchunkrenderer(room);
  SendPreStartMessage(room);

  try {
    room.intervalIds.push(
      setTimeout(() => {
        if (room.matchtype === "td") {
          const t1 = room.teams[0];
          const t2 = room.teams[1];
          room.scoreboard = [t1.id, t1.score].join("$");
        }

        room.state = "countdown";

        room.timeoutIds.push(
          setTimeout(() => {
            if (!rooms.has(roomId)) return;

            room.state = "playing";

            if (room.modifiers.has("countdown")) {
              const countdownDuration = room_max_open_time;
              const countdownStartTime = Date.now();

              room.countdownInterval = setInterval(() => {
                const elapsedTime = Date.now() - countdownStartTime;
                const remainingTime = countdownDuration - elapsedTime;

                if (remainingTime <= 0) {
                  clearInterval(room.countdownInterval);
                  room.countdown = "0:00";
                } else {
                  const minutes = Math.floor(remainingTime / 1000 / 60);
                  const seconds = Math.floor((remainingTime / 1000) % 60);
                  room.countdown = `${minutes}:${seconds
                    .toString()
                    .padStart(2, "0")}`;
                }
              }, 1000);

              room.intervalIds.push(room.countdownInterval);
            }

            initializeAnimations(room);

            if (room.modifiers.has("HealingCircles"))
              initializeHealingCircles(room);
            if (room.modifiers.has("UseZone")) UseZone(room);
            if (room.modifiers.has("AutoHealthRestore"))
              startRegeneratingHealth(room, 1);
            if (room.modifiers.has("AutoHealthDamage"))
              startDecreasingHealth(room, 1);
          }, game_start_time)
        );
      }, 1000)
    );
  } catch (err) {
    console.error(`Error starting match in room ${roomId}:`, err);
  }
}

//setInterval(() => console.log(rooms), 5000);

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
    closeRoom(roomId);
  }
}

function getDistance(x1, y1, x2, y2) {
  return Math.sqrt(Math.pow(x1 - x2, 2) + Math.pow(y1 - y2, 2));
}

const state_map = {
  waiting: 1,
  await: 2,
  countdown: 3,
  playing: 4,
};

const getAllKeys = (data) => {
  const allKeys = [];
  for (const value of Object.values(data)) {
    // Collect all keys from each value object
    allKeys.push(...Object.keys(value));
  }
  return allKeys;
};

const transformData = (data) => {
  const transformed = {};
  for (const [key, value] of Object.entries(data)) {
    transformed[key] = [value.x, value.y, value.health, value.type];
  }
  return transformed;
};

function encodePosition(num) {
  return Math.round(num * 100); // keep 2 decimals
  // Math.floor(p.x * 10)
}

function generateHash(message) {
  return JSON.stringify(message);
}

function hashArray(arr) {
  let hash = 0;
  for (let i = 0; i < arr.length; i++) {
    let val = arr[i];
    if (val === "") val = 0; // empty string -> 0
    else if (typeof val === "string") val = hashString(val); // handle non-numeric string

    hash = ((hash << 5) - hash + val) | 0;
  }
  return hash;
}

function arraysEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// Simple string-to-number hash
function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return h;
}

function BuildSelfData(p) {
  const selfdata = {
    state: p.state,
    sh: p.starthealth,
    s: +p.shooting,
    kil: p.kills,
    dmg: p.damage,
    rwds: p.finalrewards.length > 0 ? p.finalrewards : undefined,
    killer: p.eliminator,
    cg: +p.canusegadget,
    lg: p.gadgetuselimit,
    ag: +p.gadgetactive,
    el: p.eliminations.length > 0 ? p.eliminations : undefined,
    spc: p.spectatingPlayerId,
    guns: p.loadout_formatted,
    np: JSON.stringify(Array.from(p.nearbyfinalids)),
    ht: p.hitmarkers.length > 0 ? p.hitmarkers : undefined,
  };

  /*  if (p.allowweridsend) {
        selfdata.x = encodePosition(p.x);
        selfdata.y = encodePosition(p.y);
        selfdata.h = p.health
        selfdata.g = p.gun
        selfdata.em = p.emote
    }
    */

  return selfdata;
}

function SendPreStartMessage(room) {
  // Prebuild AllPlayerData

  const players = Array.from(room.players.values());

  const AllData = {};
  for (const p of players) {
    AllData[p.nmb] = [
      p.hat || 0,
      p.top || 0,
      p.player_color,
      p.hat_color,
      p.top_color,
      p.nickname,
      p.starthealth,
    ];
  }

  const dummiesFiltered = room.dummies
    ? transformData(room.dummies)
    : undefined;

  const RoomData = {
    mapid: room.map,
    type: room.matchtype,
    modifiers: Array.from(room.modifiers), // set needs array converting
    sb: room.scoreboard,
  };

  for (const player of players) {
    const self_info = {
      id: player.nmb,
      state: player.state,
      h: player.health,
      sh: player.starthealth,
      s: +player.shooting,
      g: player.gun,
      kil: player.kills,
      dmg: player.damage,
      rwds: player.finalrewards,
      killer: player.eliminator,
      cg: +player.canusegadget,
      lg: player.gadgetuselimit,
      ag: +player.gadgetactive,
      x: encodePosition(player.x),
      y: encodePosition(player.y),
      el: player.eliminations,
      em: player.emote,
      spc: player.spectatingPlayerId,
      guns: player.loadout_formatted,
      np: JSON.stringify(Array.from(player.nearbyfinalids)),
      ht: [],
    };

    player.selflastmsg = self_info;

    const MessageToSend = {
      AllData,
      SelfData: {
        teamdata: player.teamdata,
        pid: player.nmb,
        self_info,
        dummies: dummiesFiltered,
        gadget: player.gadgetid,
      },
      RoomData: RoomData,
    };

    player.send(compressMessage(MessageToSend), { binary: true });
  }
}

function prepareRoomMessages(room) {
  //console.time()

  const players = Array.from(room.players.values());
  const GameRunning = room.state === "playing" || room.state === "countdown";

  // WAITING STATE
  if (!GameRunning) {
    const roomdata = [state_map[room.state], room.maxplayers, players.length];

    for (const p of players) {
      p.tick_send_allow = false;
    }

    if (!arraysEqual(room.rdlast, roomdata)) {
      room.rdlast = roomdata;
      const compressed = compressMessage(roomdata);
      for (const p of players) {
        if (!p.wsReadyState()) continue;
        p.lastcompressedmessage = compressed;
        p.tick_send_allow = true;
        p.lastMessageHash = "default";
      }
    }
    return;
  }

  // PLAYING STATE
  const aliveCount = players.reduce((c, p) => c + !p.eliminated, 0);
  playerchunkrenderer(room);
  handlePlayerMoveIntervalAll(room);
  HandleAfflictions(room);

  // DUMMIES (once)
  let dummiesFiltered;
  if (room.dummies) {
    const transformed = transformData(room.dummies);

    if (!arraysEqual(transformed, room.previousdummies)) {
      room.dummiesfiltered = transformed;
      room.previousdummies = transformed;
    } else {
      room.dummiesfiltered = undefined;
    }
    dummiesFiltered = room.dummiesfiltered;
  }

  // ROOM DATA (once)
  let roomdata = [
    state_map[room.state],
    room.maxplayers,
    aliveCount,
    room.countdown,
    room.winner,
    room.zone,
  ];

  let finalroomdata;

  if (!arraysEqual(room.rdlast, roomdata)) {
    room.rdlast = roomdata;
    finalroomdata = roomdata;
  } else {
    finalroomdata = undefined;
  }

  const playerData = {};

  for (const p of players) {
    if (p.spectating) continue;

    const centerX = p.x;
    const centerY = p.y;
    const xThreshold = 300;
    const yThreshold = 180;

    const nearbyBullets = room.bulletgrid.getObjectsInArea(
      centerX - xThreshold,
      centerX + xThreshold,
      centerY - yThreshold,
      centerY + yThreshold
    );

    const finalBullets = [];

    if (nearbyBullets) {
      for (const bullet of nearbyBullets.values()) {
        finalBullets.push([
          bullet.id,
          Math.round(bullet.position.x),
          Math.round(bullet.position.y),
          Math.round(bullet.direction),
          bullet.gunId,
          bullet.effect,
        ]);
      }
    }

    p.finalbullets = finalBullets.length > 0 ? finalBullets : undefined;

    if (!p.alive) continue;
    //  Math.floor(p.x / 10)
    playerData[p.nmb] = [
      p.nmb,
      encodePosition(p.x),
      encodePosition(p.y),
      Number(p.direction2), // convert to number if it might be string
      Number(p.health),
      Number(p.gun),
      Number(p.emote),
    ];
  }

  // ONE PASS: Build, hash, compress, send
  for (const p of players) {
    if (!p.wsReadyState()) continue;

    const selfdata = BuildSelfData(p);

    const changes = {};
    const lastSelf = p.selflastmsg || {};
    for (const k in selfdata) {
      if (selfdata[k] !== lastSelf[k]) changes[k] = selfdata[k];
    }
    if (Object.keys(changes).length)
      p.selflastmsg = { ...lastSelf, ...changes };

    //    if (!p.nearbyids) {
    //      p.nearbyids = new Set();
    //  }

    if (p.spectating) handleSpectatorMode(p, room);

    if (!p.spectating) {
      p.nearbyids.clear();

      let filteredPlayers = [];

      const playersInRange = p.nearbyplayers;
      const previousData = p.pdHashes || {};
      const currentData = {};

      for (const nearbyId of playersInRange) {
        const data = playerData[nearbyId];
        if (!data) continue;

        if (!arraysEqual(previousData[nearbyId], data)) {
          filteredPlayers.push(data);
          p.mypd = data;
        }
        currentData[nearbyId] = data;
        p.nearbyids.add(nearbyId);

        p.pd = filteredPlayers;
        p.nearbyfinalids = p.nearbyids;
        p.pdHashes = currentData;
      }
    }

    // Message assembly
    const msg = {
      r: finalroomdata,
      dm: dummiesFiltered,
      kf: room.killfeed,
      sb: room.scoreboard,
      sd: Object.keys(changes).length ? changes : undefined,
      WLD: room.destroyedWalls,
      cl: p.nearbycircles,
      an: p.nearbyanimations,
      b: p.finalbullets,
      pd: p.pd,
    };

    // Remove empty keys
    for (const key in msg) {
      if (
        !msg[key] ||
        (Array.isArray(msg[key]) && !msg[key].length) ||
        (typeof msg[key] === "object" && !Object.keys(msg[key]).length)
      ) {
        delete msg[key];
      }
    }

    // Send if changed
    const hash = generateHash(msg);
    if (hash !== p.lastMessageHash) {
      p.lastcompressedmessage = compressMessage(msg);
      p.lastMessageHash = hash;
      p.tick_send_allow = true;
    } else {
      p.tick_send_allow = false;
    }
  }
  // CLEANUP
  room.killfeed = [];
  room.destroyedWalls = [];
  for (const p of players) {
    p.hitmarkers = [];
    p.eliminations = [];
    p.nearbyanimations = [];
  }
  // console.timeEnd();
}

function sendRoomMessages(room) {
  room.players.forEach((player) => {
    if (player.tick_send_allow) {
      player.send(player.lastcompressedmessage, { binary: true });
    }
  });
}

const validDirections = [-90, 0, 180, -180, 90, 45, 135, -135, -45];

const isValidDirection = (direction) => {
  const numericDirection = parseFloat(direction);
  return !isNaN(numericDirection) && validDirections.includes(numericDirection);
};

function handleRequest(result, message) {
  const player = result.room.players.get(result.playerId);

  if (message.length > 10) {
    player.wsClose(4000, "ahhh whyyyyy");
    return;
  }

  if (!player) return;

  switch (message) {
    case "1":
      handlePong(player);
      break;
  }

  if (
    result.room.state !== "playing" ||
    player.alive === false ||
    player.eliminated ||
    !result.room.winner === -1
  )
    return;

  const data = message.split(":");

  const type = data[0];

  switch (type) {
    case "3":
      handleMovementData(data, player);
      break;
    case "4":
      handleShoot(data, player, result.room);
      break;
    case "5":
      handleSwitchGun(data, player);
      break;
    case "6":
      handleEmote(data, player);
      break;
    case "7":
      handleGadget(player);
      break;
  }

  if (type === "2") {
    player.moving = false;
  }
}

function handlePong(player) {
  const now = Date.now();

  if (player.lastPing && now - player.lastPing < 1000) {
    return;
  }
  player.lastPing = now;
}

function handleShoot(data, player, room) {
  const shoot_direction = data[1];
  if (shoot_direction > -181 && shoot_direction < 181) {
    player.shoot_direction = parseFloat(shoot_direction);
    handleBulletFired(room, player, player.gun);
  }
}

function handleSwitchGun(data, player) {
  const GunID = data[1];
  if (
    GunID !== player.gun &&
    !player.shooting &&
    player.loadout[GunID] &&
    GunID in gunsconfig
  ) {
    player.gun = player.loadout[GunID];
  }
}

function handleEmote(data, player) {
  const emoteid = data[1];
  if (emoteid >= 1 && emoteid <= 4 && player.emote === 0) {
    player.emote = emoteid;
    player.timeoutIds.push(
      setTimeout(() => {
        player.emote = 0;
      }, 3000)
    );
  }
}

function handleGadget(player) {
  if (player.canusegadget && player.gadgetuselimit > 0) {
    player.canusegadget = false;
    player.gadgetuselimit--;
    player.usegadget(player);
    player.timeoutIds.push(
      setTimeout(() => {
        player.canusegadget = true;
      }, player.gadgetcooldown)
    );
  }
}

function handleMovementData(data, player) {
  const direction = data[1];

  if (isValidDirection(direction)) {
    const validDirection = direction;
    if (validDirection) {
      updatePlayerDirection(player, direction);
      player.moving = true;
      //handlePlayerMoveInterval(player, room);
    } else {
      console.warn("Invalid direction value:", direction);
    }
  }
}

function updatePlayerDirection(player, direction) {
  player.direction = direction;

  if (player.direction == -180 || player.direction == 0) {
  } else
    player.direction2 = direction > 90 ? 90 : direction < -90 ? -90 : direction; // Adjust otherwise
}

async function handlePlayerMoveIntervalAll(room) {
  room.players.forEach((player) => {
    if (player.moving && player.state === 1) {
      handleMovement(player, room);
    }
  });
}

module.exports = {
  // compressMessage,
  joinRoom,
  createRoom,
  handleRequest,
  handlePong,
  getDistance,
  RemoveRoomPlayer,
  roomIndex,
};
