
const { axios, Limiter, msgpack, LZString, compressMessage } = require('./..//index.js');
const { matchmaking_timeout, server_tick_rate, game_start_time, rooms, mapsconfig, gunsconfig, gamemodeconfig, matchmakingsp, player_idle_timeout, room_max_open_time } = require('./config.js');
const { handleBulletFired } = require('./bullets.js');
const { handleMovement } = require('./player.js');
const { startRegeneratingHealth, startDecreasingHealth } = require('./match-modifiers');
const { gadgetconfig } = require('./gadgets.js')
const { StartremoveOldKillfeedEntries } = require('./killfeed.js')
const { UseZone } = require('./zone')
const { initializeHealingCircles } = require('./../gameObjectEvents/healingcircle')
const { initializeAnimations } = require('./../gameObjectEvents/deathrespawn')
const { playerchunkrenderer } = require('./../playerhandler/playerchunks')
const { SpatialGrid, gridcellsize } = require('./config.js');
const roomIndex = new Map();
const { compressToUint8Array } = require('lz-string');



function getAvailableRoom(gamemode, spLevel) {
  const key = `${gamemode}_${spLevel}`;
  const roomList = roomIndex.get(key) || [];
  return roomList.find(room => room.players.size < room.maxplayers && room.state === 'waiting');
}

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8); // Ensures UUID version 4
    return v.toString(16);
  });
}


function getAvailableRoom(gamemode, spLevel) {
  const key = `${gamemode}_${spLevel}`;
  const roomList = roomIndex.get(key) || [];
  return roomList.find(room => room.players.size < room.maxplayers && room.state === 'waiting');
}

function addRoomToIndex(room) {
  const key = `${room.gamemode}_${room.sp_level}`;
  if (!roomIndex.has(key)) roomIndex.set(key, []);
  roomIndex.get(key).push(room);
}

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


function createRateLimiter() {
  const rate = 40; // Allow one request every 50 milliseconds
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

    player.x = spawnPositions[spawnIndex].x,
      player.y = spawnPositions[spawnIndex].y,

      // Assign the spawn position to the player
      player.startspawn = {
        x: spawnPositions[spawnIndex].x,
        y: spawnPositions[spawnIndex].y
      };

    // Increment the player number for the next player
    playerNumberID++;
  });
}

async function CreateTeams(room) {
  if (!room.players || room.players.size === 0) return;

  // Define team IDs
  const teamIDs = ["Red", "Blue", "Green", "Yellow", "Orange", "Purple", "Pink", "Cyan"];
  const numTeams = Math.ceil(room.players.size / room.teamsize);
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

  // Step 2: Finalize `room.teams`
  room.teams = teams.map((team, index) => ({
    id: teamIDs[index] || `Team-${index + 1}`,
    players: team,
    score: 0,
  }));

  // Step 3: Assign complete `teamdata` to each player
  room.players.forEach((player) => {
    const team = player.team; // Get the player's team
    const playerIds = Object.fromEntries(
      team.players.map((p) => [p.nmb, p.nmb]) // Extract all player IDs in the team
    );

    player.teamdata = {
      id: playerIds, // Complete team member IDs
      tid: team.id,  // Team ID
    };
  });
}


function clearAndRemoveInactiveTimers(timerArray, clearFn) {
  return timerArray.filter(timer => {
    if (timer._destroyed || timer._idleTimeout === -1) {
      // Timer is already destroyed or no longer active
      clearFn(timer); // Clear the timeout or interval
      return false; // Remove from the array
    }
    return true; // Keep active timers
  });
}


function clearAndRemoveCompletedTimeouts(timeoutArray, clearFn) {
  return timeoutArray.filter(timeout => {
    if (timeout._destroyed || timeout._idleTimeout === -1 || timeout._called) {
      // _called indicates that the timeout has already been executed (Node.js)
      clearFn(timeout)
      return false; // Remove from the array as it's completed or inactive
    }
    return true; // Keep active timeouts
  });
}


function closeRoom(roomId) {
  const room = rooms.get(roomId);


  if (room) {
    if (room.timeoutIds) room.timeoutIds.forEach(timeoutId => clearTimeout(timeoutId));
    if (room.intervalIds) room.intervalIds.forEach(intervalId => clearInterval(intervalId));
    clearInterval(room.xcleaninterval)
    clearTimeout(room.matchmaketimeout);
    clearTimeout(room.fixtimeout);
    clearTimeout(room.fixtimeout2);
    clearTimeout(room.fixtimeout3);
    clearTimeout(room.fixtimeout4);
    clearTimeout(room.runtimeout);

    clearInterval(room.xcleaninterval)
    clearInterval(room.intervalId);
    clearInterval(room.shrinkInterval);
    clearInterval(room.zonefulldamage);
    clearInterval(room.zoneinterval);
    clearInterval(room.pinger);
    clearInterval(room.snapInterval);
    clearInterval(room.cleanupinterval);
    clearInterval(room.decreasehealth);
    clearInterval(room.regeneratehealth);
    clearInterval(room.countdownInterval);


    // Clean up resources associated with players in the room
    room.players.forEach(player => {

      if (player.timeoutIds) player.timeoutIds.forEach(timeoutId => clearTimeout(timeoutId));
      if (player.intervalIds) player.intervalIds.forEach(intervalId => clearInterval(intervalId));
      clearTimeout(player.timeout);
      clearTimeout(player.movetimeout);
      clearTimeout(player.gadget);
      clearTimeout(player.gadget_timeout);
      clearInterval(player.moveInterval);

      player.ws.close();

    });

    rooms.delete(roomId);
    removeRoomFromIndex(room)


    //console.log(`Room ${roomId} closed.`);
  } else {
    //console.log(`Room ${roomId} not found.`);
  }
}

function playerLeave(roomId, playerId) {
  const room = rooms.get(roomId);
  if (room) {
    const player = room.players.get(playerId);
    if (player) {
      clearTimeout(player.timeout);
      clearInterval(player.moveInterval);

      // Remove the player from the room
      room.players.delete(playerId);

      // If no players left in the room, close the room
      if (room.players.size === 0) {
        closeRoom(roomId);
      }
    }
  }
}


async function joinRoom(ws, gamemode, playerVerified) {
  try {
    const { playerId, hat, top, player_color, hat_color, top_color, gadget, skillpoints, nickname, loadout } = playerVerified;

    //const fallbackloadout = { 1: "1", 2: "5", 3: "DEVLOCKED" }
    const fallbackloadout = { 1: "1", 2: "2", 3: "3" }
    const gadgetselected = gadget || 1;
    const finalskillpoints = skillpoints || 0;
    const max_length = 16
    const min_length = 4

    if (nickname.length < min_length || nickname.length > max_length) {

      ws.close(4004)
    }

    const finalnickname = nickname.replace(/[:$]/g, '');

    const roomjoiningvalue = matchmakingsp(finalskillpoints);

    let roomId, room;


    // Check if there's an existing room with available slots
    const availableRoom = getAvailableRoom(gamemode, roomjoiningvalue)

    if (availableRoom) {
      roomId = availableRoom.roomId;
      room = availableRoom;
    } else {
      roomId = generateUUID();
      room = createRoom(roomId, gamemode, gamemodeconfig[gamemode], roomjoiningvalue);
      addRoomToIndex(room)
      roomCreationLock = true; // Indicate that this function created the room
    }


    const playerRateLimiter = createRateLimiter();

    const newPlayer = {
      ws,
      lastmsg: 0,
      intervalIds: [],
      timeoutIds: [],
      direction: null,
      direction2: 90,
      playerId: playerId,
      finalrewards_awarded: false,
      spectateid: 0,
      nickname: finalnickname,
      spectatingTarget: null,
      spectatingplayerid: null,
      rateLimiter: playerRateLimiter,
      hat: hat,
      top: top,
      player_color: player_color,
      hat_color: hat_color,
      top_color: top_color,
      health: gamemodeconfig[gamemode].playerhealth,
      state: 1,
      starthealth: gamemodeconfig[gamemode].playerhealth,
      speed: gamemodeconfig[gamemode].playerspeed,
      startspeed: gamemodeconfig[gamemode].playerspeed,
      can_bullets_bounce: false,
      damage: 0,
      kills: 0,
      lastShootTime: 0,
      moving: false,
      moveInterval: null,
      visible: true,
      eliminated: false,
      place: null,
      shooting: false,
      shoot_direction: 90,
      loadout: loadout || fallbackloadout,
      loadout_formatted: [loadout[1], loadout[2],loadout[3]].join('$'),
      //loadout: fallbackloadout,
      bullets: new Map(),
      spectatingPlayer: playerId,
      emote: 0,
      respawns: room.respawns,
      gadgetid: gadgetselected,
      canusegadget: true,
      gadgetcooldown: gadgetconfig[gadgetselected].cooldown,
      gadgetuselimit: gadgetconfig[gadgetselected].use_limit,
      gadgetchangevars: gadgetconfig[gadgetselected].changevariables,

      usegadget() {
        const player = room.players.get(playerId);

        if (player && room.state === 'playing' && player.visible) {
          gadgetconfig[gadgetselected].gadget(player, room);
        } else {
          console.error('Player not found or cannot use gadget');
        }
      },
    };

    newPlayer.gun = newPlayer.loadout[1];

    if (newPlayer.gadgetchangevars) {
      for (const [variable, change] of Object.entries(newPlayer.gadgetchangevars)) {
        newPlayer[variable] += Math.round(newPlayer[variable] * change);
      }
    }

    if (room) {
      newPlayer.timeout = setTimeout(() => {
        if (newPlayer.lastPing <= Date.now() - 8000) {

          newPlayer.ws.close(4200, "disconnected_inactivity")
        }
      }, player_idle_timeout);

      room.players.set(playerId, newPlayer);

      if (ws.readyState === ws.CLOSED) {
        playerLeave(roomId, playerId);
        return;
      }
    }

    if (room.state === "waiting" && room.players.size >= room.maxplayers) {

      room.state = "await";

      await setupRoomPlayers(room)

      await CreateTeams(room)

      clearTimeout(room.matchmaketimeout);

      try {

        //  room.state = "await";

        setTimeout(() => {

          if (room.matchtype === "td") {

            const t1 = room.teams[0];
            const t2 = room.teams[1];

            room.scoreboard = [
              t1.id,
              t1.score,
              t2.id,
              t2.score,
            ].join('$')

          }


          playerchunkrenderer(room)
          SendPreStartMessage(room)
          room.state = "countdown";
          //  console.log(`Room ${roomId} entering countdown phase`);

          setTimeout(() => {
            if (!rooms.has(roomId)) return;

            room.state = "playing";

            if (room.showtimer === true) {
              const countdownDuration = room_max_open_time // 10 minutes in milliseconds
              const countdownStartTime = Date.now();

              room.intervalIds.push(setInterval(() => {
                const elapsedTime = Date.now() - countdownStartTime;
                const remainingTime = countdownDuration - elapsedTime;

                if (remainingTime <= 0) {
                  clearInterval(room.countdownInterval);
                  room.countdown = "0-00";
                } else {
                  const minutes = Math.floor(remainingTime / 1000 / 60);
                  const seconds = Math.floor((remainingTime / 1000) % 60);
                  room.countdown = `${minutes}-${seconds.toString().padStart(2, '0')}`;
                }
              }, 1000));
            }

            // console.log(`Room ${roomId} transitioned to playing state`);
            StartremoveOldKillfeedEntries(room);
            initializeAnimations(room);
            if (room.modifiers.has("HealingCircles")) initializeHealingCircles(room);
            if (room.modifiers.has("UseZone")) UseZone(room);
            if (room.modifiers.has("AutoHealthRestore")) startRegeneratingHealth(room, 1);
            if (room.modifiers.has("AutoHealthDamage")) startDecreasingHealth(room, 1);

          }, game_start_time);

        }, 1000);
      } catch (err) {


      }
    }

    if (ws.readyState === ws.CLOSED) {
      playerLeave(roomId, playerId);
      return;
    }

    return { roomId, playerId, room };

  } catch (error) {
    console.error("Error joining room:", error);
    ws.close(4000, "Error joining room");
    throw error;
  }
}


function cleanupRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room) {
    return;
  }

  // Clear the cleanup interval if it exists
  if (room.cleanupinterval) {
    clearInterval(room.cleanupinterval);
  }

  const playersWithOpenConnections = room.players.filter(player => player.ws && player.ws.readyState === WebSocket.OPEN);

  //console.log(playersWithOpenConnections);
  // Close the room if it has no players
  if (room.players.size < 1 || playersWithOpenConnections.length < 1 || !room.players || room.players.size === 0) {
    closeRoom(roomId);
  }
}


function getDistance(x1, y1, x2, y2) {
  return Math.sqrt(
    Math.pow(x1 - x2, 2) + Math.pow(y1 - y2, 2),
  );

}

const state_map = {
  "waiting": 1,
  "await": 2,
  "countdown": 3,
  "playing": 4
}

const getAllKeys = (data) => {
  const allKeys = [];
  for (const value of Object.values(data)) {
    // Collect all keys from each value object
    allKeys.push(...Object.keys(value));
  }
  return allKeys;
};

function SendPreStartMessage(room) {
  let AllPlayerData = {};

  room.players.forEach(player => {
    AllPlayerData[player.nmb] = {
      hat: player.hat || 0,
      top: player.top || 0,
      color: player.player_color,
      hat_color: player.hat_color,
      top_color: player.top_color,
      nickname: player.nickname,
      starthealth: player.starthealth
    };
  });

  const transformData = (data) => {
    const transformed = {};
    for (const [key, value] of Object.entries(data)) {
      transformed[key] = `${value.x}:${value.y}:${value.h}:${value.sh}:${value.t}`;
    }
    return transformed;
  };

  const dummiesfiltered = room.dummies ? transformData(room.dummies) : undefined;

  Array.from(room.players.values()).forEach(player => {

    const selfinfo = {
      id: player.nmb,
      state: player.state,
      h: player.health,
      sh: player.starthealth,
      s: player.shooting ? 1 : 0,
      g: player.gun,
      kil: player.kills,
      dmg: player.damage,
      rwds: [player.place, player.skillpoints_inc, player.seasoncoins_inc].join('$'),
      killer: player.eliminator,
      cg: player.canusegadget ? 1 : 0,
      lg: player.gadgetuselimit,
      x: player.x,
      y: player.y,
      hit: player.hitdata,
      el: player.elimlast,
      em: player.emote,
      spc: player.spectateid,
      guns: player.loadout_formatted,
      np: player.npfix
    };

    const selfdata = {
      teamdata: player.teamdata,
      pid: player.nmb,
      self_info: selfinfo,
      dummies: room.dummies ? dummiesfiltered : undefined
    };

    const MessageToSend = {
      AllPlayerData: AllPlayerData,
      SelfData: selfdata,
      // clientVersion: "v3.5678",
      //roomid: room.roomId
    };

    const FinalPreMessage = JSON.stringify(MessageToSend)

    const compressedPlayerMessage = compressMessage(FinalPreMessage)
    player.ws.send(compressedPlayerMessage, { binary: true })
  });
}



function sendBatchedMessages(roomId) {
  const room = rooms.get(roomId);

  handlePlayerMoveIntervalAll(room)

  const playercountroom = Array.from(room.players.values()).filter(player => !player.eliminated).length;

  if (room.dummies) {
    const transformData = (data) => {
      const transformed = {};
      for (const [key, value] of Object.entries(data)) {
        transformed[key] = `${value.x}:${value.y}:${value.h}:${value.sh}:${value.t}`;
      }
      return transformed;
    };

    const dummiesfiltered = transformData(room.dummies);

    if (room.state === "playing") {

      if (generateHash(JSON.stringify(dummiesfiltered)) !== room.previousdummies) {
        room.dummiesfiltered = dummiesfiltered;
      } else {
        room.dummiesfiltered = undefined
      }
      room.previousdummies = generateHash(JSON.stringify(dummiesfiltered));
    } else {
      room.dummiesfiltered = dummiesfiltered;
    }

  }

  let roomdata = [
    state_map[room.state],
    room.zone,
    room.maxplayers,
    playercountroom,
    room.map,
    room.countdown,
    room.winner,
  ].join(':');

  if (room.rdlast !== roomdata) {
    room.rdlast = roomdata;
  } else {
    roomdata = undefined;
  }

  let playerData = {};

  Array.from(room.players.values()).forEach(player => {

    if (player.visible !== false) {
      const formattedBullets = {};
      player.bullets.forEach(bullet => {
        const timestamp = bullet.timestamp;
        const x = Math.round(bullet.x);
        const y = Math.round(bullet.y);
        const direction = Math.round(bullet.direction);
        const gunid = bullet.gunid;
        formattedBullets[timestamp] = `${timestamp}=${x},${y},${direction},${gunid};`;
      });

      const finalBullets = Object.keys(formattedBullets).length > 0
        ? "$b" + Object.values(formattedBullets).join("")
        : undefined;

      player.finalbullets = finalBullets

      if (room.state === "playing") {

        const currentPlayerData = [
          player.x,
          player.y,
          player.direction2,
          player.health,
          player.gun,
          player.emote,
          finalBullets,
        ].join(':');

        playerData[player.nmb] = currentPlayerData;
      }
    }
  });



  room.players.forEach(player => {

    player.npfix = JSON.stringify(player.nearbyfinalids ? Array.from(player.nearbyfinalids) : [])
    const selfdata = {
      id: player.nmb,
      state: player.state,
      h: player.health,
      sh: player.starthealth,
      s: player.shooting ? 1 : 0,
      g: player.gun,
      kil: player.kills,
      dmg: player.damage,
      rwds: [player.place, player.skillpoints_inc, player.seasoncoins_inc].join('$'),
      killer: player.eliminator,
      cg: player.canusegadget ? 1 : 0,
      lg: player.gadgetuselimit,
      x: player.x,
      y: player.y,
      hit: player.hitdata,
      el: player.elimlast,
      em: player.emote,
      spc: player.spectateid,
      guns: player.loadout_formatted,
      np: player.npfix
    };

    const lastSelfData = player.lastSelfData || {};
    const changedSelfData = Object.fromEntries(
      Object.entries(selfdata).filter(([key, value]) => lastSelfData[key] !== value)
    );

    player.lastSelfData = selfdata
    const selfPlayerData = Object.keys(changedSelfData).length > 0 ? changedSelfData : {};

    let filteredplayers = {};
    player.nearbyids = new Set();

    if (room.state === "playing") {
      const playersInRange = player.nearbyplayers;
      const previousHashes = player.pdHashes || {};

      filteredplayers = Object.entries(playerData).reduce((result, [playerId, playerData]) => {
        if (playersInRange.has(Number(playerId))) {
          player.nearbyids.add(playerId);
          const currentHash = generateHash(playerData);

          if (!previousHashes[playerId] || previousHashes[playerId] !== currentHash) {
            result[playerId] = playerData;
            previousHashes[playerId] = currentHash;
          }
        }
        return result;
      }, {});

      player.nearbyfinalids = player.nearbyids

      player.pd = filteredplayers;
      player.pdHashes = previousHashes;
    } else {
      if (room.state === "countdown") {
        player.pd = playerData;
        player.pdHashes = {};
      } else {
        player.pd = {};
        player.pdHashes = {};
      }
    }

    const newMessage = {
      pd: playerData,
      rd: roomdata,
      dm: room.dummiesfiltered,
    };

    let playerSpecificMessage;

    if (room.state === "waiting") {
      playerSpecificMessage = {
        rd: newMessage.rd,
      };
    } else {
      let finalselfdata
      if (room.state === "playing") {

        if (player.selflastmsg !== selfPlayerData) {
          player.selflastmsg = selfPlayerData;
          finalselfdata = selfPlayerData
        } else {
          finalselfdata = undefined;
        }
      } else {
        finalselfdata = selfdata
      }

      const entries = [
        ['rd', newMessage.rd],
        ['dm', room.state === "playing" ? newMessage.dm : undefined],
        ['kf', room.newkillfeed],
        ['sb', room.scoreboard],
        ['sd', room.state === "playing" ? finalselfdata : undefined],
        ['WLD', room.destroyedWalls],
        ['cl', player.nearbycircles],
        ['an', player.nearbyanimations],
        ['b', player.finalbullets],
        ['pd', player.pd],
      ];

    
      
        playerSpecificMessage = Object.fromEntries(
        entries.filter(([_, value]) => {
          if (value == null) return false; // filters null and undefined
          if (Array.isArray(value)) return value.length > 0;
          if (typeof value === 'object') return Object.keys(value).length > 0;
          return true;
        })
      );
    }

    const currentMessageHash = generateHash(playerSpecificMessage);
    const playermsg = JSON.stringify(playerSpecificMessage)
    if (player.ws && currentMessageHash !== player.lastMessageHash) { // && playermsg !== "{}" 
      const compressedPlayerMessage = compressMessage(playermsg)
      player.ws.send(compressedPlayerMessage, { binary: true });
      player.lastMessageHash = currentMessageHash;
    }
  });
  room.destroyedWalls = [];
}

function generateHashFive(obj) {
  return JSON.stringify(obj)
    .split('')
    .reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 0)
    .toString(16);
}

function generateHash(message) {
  let hash = 0;
  const str = JSON.stringify(message);
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  return hash;
}

function getRandomInt(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getDistance(x1, y1, x2, y2) {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

function deepCopy(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function createRoom(roomId, gamemode, gmconfig, splevel) {


  let mapid
  if (gmconfig.custom_map) {
    mapid = gmconfig.custom_map
  } else {

    const keyToExclude = "3";

    // Get the keys of mapsconfig and filter out the excluded key
    const filteredKeys = Object.keys(mapsconfig).filter(key => key !== keyToExclude);

    // Ensure there are keys to choose from

    // Randomly select a key from the filtered list
    const randomIndex = getRandomInt(0, filteredKeys.length - 1);
    mapid = filteredKeys[randomIndex];
    //mapid = (getRandomInt(1, Object.keys(mapsconfig).length))

  }

  const itemgrid = new SpatialGrid(gridcellsize); // grid system for items

   const map = mapsconfig[mapid];
  const mapgrid = new SpatialGrid(gridcellsize);

  map.walls.forEach(wall => mapgrid.addWall(wall));

  // Save the grid in the map configuration
 const roomgrid = mapgrid;

 


 const room = {
  // Game State
  currentplayerid: 0,
  eliminatedTeams: [],
  gamemode: gamemode,
  intervalIds: [],
  killfeed: [],
  matchtype: gmconfig.matchtype,
  newkillfeed: [],
  objects: [],
  destroyedWalls: [],
  players: new Map(),
  snap: [],
  state: "waiting", // Possible values: "waiting", "playing", "countdown"
  timeoutIds: [],
  winner: -1,

  // Game Configuration
  itemgrid: itemgrid,
  maxplayers: gmconfig.maxplayers,
  modifiers: gmconfig.modifiers,
  place_counts: gmconfig.placereward,
  respawns: gmconfig.respawns_allowed,
  showtimer: gmconfig.show_timer,
  sp_level: splevel,
  ss_counts: gmconfig.seasoncoinsreward,
  teamsize: gmconfig.teamsize,

  // Map Configuration
  grid: roomgrid,
  map: mapid,
  mapHeight: mapsconfig[mapid].height,
  mapWidth: mapsconfig[mapid].width,
  spawns: mapsconfig[mapid].spawns,
  walls: mapsconfig[mapid].walls, // Could be mapped differently if needed
  zoneStartX: -mapsconfig[mapid].width,
  zoneStartY: -mapsconfig[mapid].height,
  zoneEndX: mapsconfig[mapid].width,
  zoneEndY: mapsconfig[mapid].height,

  // Metadata
  roomId: roomId,
};



  room.xcleaninterval = setInterval(() => {
    if (room) {
      // Clear room's timeout and interval arrays
      if (room.timeoutIds) {
        room.timeoutIds = clearAndRemoveCompletedTimeouts(room.timeoutIds, clearTimeout);
      }
      if (room.intervalIds) {

        room.intervalIds = clearAndRemoveInactiveTimers(room.intervalIds, clearInterval);
      }

      // Clear player-specific timeouts and intervals
      room.players.forEach(player => {
        if (player.timeoutIds) {
          player.timeoutIds = clearAndRemoveCompletedTimeouts(player.timeoutIds, clearTimeout);
        }
        if (player.intervalIds) {
          player.intervalIds = clearAndRemoveInactiveTimers(player.intervalIds, clearInterval);
        }
      });
    }
  }, 1000); // Run every 1 second

  if (gmconfig.can_hit_dummies && mapsconfig[mapid].dummies) {
    room.dummies = deepCopy(mapsconfig[mapid].dummies) //dummy crash fix
  }

  const roomConfig = {
    canCollideWithDummies: gmconfig.can_hit_dummies, // Disable collision with dummies
    canCollideWithPlayers: gmconfig.can_hit_players,// Enable collision with players
  };

  room.config = roomConfig

  rooms.set(roomId, room);
  // console.log("room created:", roomId)

  room.matchmaketimeout = setTimeout(() => {


    room.players.forEach((player) => {

      clearInterval(player.moveInterval)
      clearTimeout(player.timeout)

      if (room.eliminatedTeams) {
        player.ws.close(4100, "matchmaking_timeout");
      }
    });
    closeRoom(roomId);
  }, matchmaking_timeout);


  // Start sending batched messages at regular intervals
  room.intervalIds.push(setInterval(() => {

    sendBatchedMessages(roomId);
  }, server_tick_rate));

  // room.intervalId = intervalId;
  room.timeoutIds.push(setTimeout(() => {


    room.intervalIds.push(setInterval(() => {

      if (room) {
        cleanupRoom(room);
      }
    }, 1000));
  }, 10000));


  const roomopentoolong = room.timeoutIds.push(setTimeout(() => {
    closeRoom(roomId);
    //  console.log(`Room ${roomId} closed due to timeout.`);
  }, room_max_open_time));
  room.runtimeout = roomopentoolong;

  // Countdown timer update every second


  // console.log("Room", room.roomId, "created")
  return room;
}

function generateRandomCoins(roomId) {
  const coins = [];
  for (let i = 0; i < 1; i++) {
    const coin = {
      x: Math.floor(Math.random() * (roomId.mapWidth * 2 + 1)) - roomId.mapWidth,
      y: Math.floor(Math.random() * (roomId.mapHeight * 2 + 1)) - roomId.mapHeight,
    };
    coins.push(coin);
  }
  roomId.coins = coins;


}

function handleCoinCollected2(result, index) {
  const room = rooms.get(result.roomId);
  const playerId = result.playerId;

  room.coins.splice(index, 1);

  const expectedOrigin = "tw-editor://.";
  axios
    .post(
      `https://liquemgames-api.netlify.app/increasecoins-lqemfindegiejgkdmdmvu/${playerId}`,
      null,
      {
        headers: {
          Origin: expectedOrigin,
        },
      },
    )
    .then(() => {
      console.log(`Coins increased for player ${playerId}`);
    })
    .catch((error) => {
      console.error("Error increasing coins:", error);
    });


  // Generate new random coins
  generateRandomCoins(room);
}

const validDirections = [-90, 0, 180, -180, 90, 45, 135, -135, -45];

const isValidDirection = (direction) => {
  const numericDirection = parseFloat(direction);
  return !isNaN(numericDirection) && validDirections.includes(numericDirection);
};


function handleRequest(result, message) {
  const player = result.room.players.get(result.playerId);

  if (message.length > 100) {
    player.ws.close(4000, "ahhh whyyyyy");
    return;
  }

  if (!player) return;

  switch (message) {
    case "1":
      handlePong(player);
      break;
  }

  if (result.room.state !== "playing" || player.visible === false || player.eliminated || !result.room.winner === -1) return;

  const data = message.split(':');

  const type = data[0]

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
  //handleMovingState(data.moving, player);

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
  const shoot_direction = data[1]
  if (shoot_direction > -181 && shoot_direction < 181) {
    player.shoot_direction = parseFloat(shoot_direction);
    handleBulletFired(room, player, player.gun);
  }
}

function handleSwitchGun(data, player) {
  const GunID = parseFloat(data[1]);
  const allguns = Object.keys(gunsconfig);
  if (
    GunID !== player.gun && !player.shooting && GunID >= 1 && GunID <= 3 && GunID in allguns) {

    player.gun = player.loadout[GunID];

  } else {

  }

}

function handleEmote(data, player) {
  const emoteid = data[1]
  if (emoteid >= 1 && emoteid <= 4 && player.emote === 0) {
    player.emote = emoteid;
    player.timeoutIds.push(setTimeout(() => {
      player.emote = 0;
    }, 3000));
  }
}

function handleGadget(player) {
  if (player.canusegadget && player.gadgetuselimit > 0) {
    player.canusegadget = false;
    player.gadgetuselimit--;
    player.usegadget();
    player.timeoutIds.push(setTimeout(() => {
      player.canusegadget = true;
    }, player.gadgetcooldown));
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


function handlePlayerMoveIntervalAll(room) {

  room.players.forEach((player) => {
    if (player.moving && player.state === 1) {
      handleMovement(player, room);
    };
  });
}

/*function handleRequest(result, message) {
  const player = result.room.players.get(result.playerId);
  const data = JSON.parse(message);

  if (message.length > 100) {
    player.ws.close(4000, "ahhh whyyyyy");
    }

  if (player) {

  if (data.type === "pong") {

        clearTimeout(player.timeout); 

        player.timeout = setTimeout(() => { player.ws.close(4200, "disconnected_inactivity"); }, player_idle_timeout); 
            //    const timestamp = new Date().getTime();
        //if (player.lastping && (timestamp - player.lastping < 2000)) {
        //	player.ping = timestamp - player.lastping;
        //} else {
	
        //}
      }
                  }
	

  if (result.room.state === "playing" && player.visible !== false && !player.eliminated) {
    try {
      if (data.type === "shoot") {
        if (data.shoot_direction > -181 && data.shoot_direction < 181) {
          player.shoot_direction = parseFloat(data.shoot_direction);
          handleBulletFired(result.room, player, player.gun);
        } else {
        //	console.log(data.shoot_direction)
        }
      }
    	

      if (data.type === "switch_gun") {
        const selectedGunNumber = parseFloat(data.gun);
        const allguns = Object.keys(gunsconfig).length;
        if (
          selectedGunNumber !== player.gun &&
          !player.shooting &&
          selectedGunNumber >= 1 &&
          selectedGunNumber <= allguns
        ) {
        	
          player.gun = selectedGunNumber;
        } else if (player.shooting) {
        	
          console.log("Cannot switch guns while shooting.");
        } else {
        	
          console.log("Gun number must be between 1 and 3.");
        }
      }
      if (data.moving === "false") {
        clearInterval(player.moveInterval);
        player.moveInterval = null;
        player.moving = false;
      }


      if (data.type === "emote" && data.id >= 1 && data.id <= 4 && player.emote === 0){
         
        player.emote = data.id

        setTimeout(() =>{
        player.emote = 0

        }, 3000);
        }

        if (data.type === "gadget" && player.canusegadget && player.gadgetuselimit > 0){
         
          player.canusegadget = false
          player.gadgetuselimit--
  
          player.usegadget();
          setTimeout(() =>{
            player.canusegadget = true
  
          }, player.gadgetcooldown);
          }


      if (
        data.type === "movement" &&
        typeof data.direction === "string" &&
        isValidDirection(data.direction)
      ) {
        const validDirection = parseFloat(data.direction);
        if (!isNaN(validDirection)) {
          if (player) {
          	
            player.direction = validDirection;
            if (validDirection > 90) {
              player.direction2 = 90;
            } else if (validDirection < -90) {
              player.direction2 = -90;
            } else {
              player.direction2 = validDirection;
            }
          	
            if (data.moving === "true") {
          	
              if (!player.moving === true) {
                player.moving = true;
              }
            } else if (data.moving === "false") {
            	
              player.moving = false;
            } else {
              console.warn("Invalid 'moving' value:", data.moving);
            }
        	
            if (!player.moveInterval) {
              clearInterval(player.moveInterval);
              player.moveInterval = setInterval(() => {
             
                if (player.moving) {
                  

                  handleMovement(player, result.room);
                } else {
               
                  clearInterval(player.moveInterval);
                  player.moveInterval = null;
                }
              }, server_tick_rate);
            }
          }
        } else {
          console.warn("Invalid direction value:", data.direction);
        }
      }
    } catch (error) {
      console.error("Error parsing message:", error);
    }
  }
}
*/

module.exports = {
 // compressMessage,
  joinRoom,
  sendBatchedMessages,
  createRoom,
  generateRandomCoins,
  handleRequest,
  closeRoom,
  handleCoinCollected2,
  handlePong,
  getDistance,
 
};