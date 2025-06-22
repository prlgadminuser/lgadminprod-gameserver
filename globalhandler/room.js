
const { Limiter, compressMessage } = require('./..//index.js');
const { matchmaking_timeout, server_tick_rate, game_start_time, mapsconfig, gunsconfig, gamemodeconfig, matchmakingsp, player_idle_timeout, room_max_open_time } = require('./config.js');
const { handleBulletFired } = require('./bullets.js');
const { handleMovement } = require('./player.js');
const { startRegeneratingHealth, startDecreasingHealth } = require('./match-modifiers');
const { gadgetconfig } = require('./gadgets.js')
const { StartremoveOldKillfeedEntries, addKillToKillfeed } = require('./killfeed.js')
const { UseZone } = require('./zone')
const { initializeHealingCircles } = require('./../gameObjectEvents/healingcircle')
const { initializeAnimations } = require('./../gameObjectEvents/deathrespawn')
const { playerchunkrenderer } = require('./../playerhandler/playerchunks')
const { SpatialGrid, gridcellsize } = require('./config.js');
const { compressToUint8Array } = require('lz-string');
const { increasePlayerKills, increasePlayerDamage } = require('./dbrequests');
const { roomIndex, rooms, closeRoom, addRoomToIndex, getAvailableRoom } = require('./../roomhandler/manager')


function generateUUID() {
  return 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8); // Ensures UUID version 4
    return v.toString(16);
  });
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

function getDistance(x1, y1, x2, y2) {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

function deepCopy(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function cloneSpatialGrid(original) {
  const clone = new SpatialGrid(original.cellSize);

  // Deep clone the grid
  for (const [key, originalSet] of original.grid.entries()) {
    const clonedSet = new Set();
    for (const obj of originalSet) {
      // Clone object if needed (shallow copy here, do deep copy if required)
      clonedSet.add({ ...obj });
    }
    clone.grid.set(key, clonedSet);
  }

  return clone;
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

  let numTeams
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






function RemoveRoomPlayer(room, player) {


  player.timeoutIds?.forEach(clearTimeout);
  player.intervalIds?.forEach(clearInterval);

  if (player.damage > 0) increasePlayerDamage(player.playerId, player.damage);
  if (player.kills > 0) increasePlayerKills(player.playerId, player.kills);

  player.ws.close();

  addKillToKillfeed(room, 5, null, player.nmb, null)
  room.players.delete(player.playerId);




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
    }


    const playerRateLimiter = createRateLimiter();

    const newPlayer = {
      // player cosmetics appearance
      playerId: playerId,
      nickname: finalnickname,
      hat: hat,
      top: top,
      player_color: player_color,
      hat_color: hat_color,
      top_color: top_color,

      // game state
      health: gamemodeconfig[gamemode].playerhealth,
      starthealth: gamemodeconfig[gamemode].playerhealth,
      speed: gamemodeconfig[gamemode].playerspeed,
      startspeed: gamemodeconfig[gamemode].playerspeed,
      damage: 0,
      kills: 0,
      place: null,
      state: 1,
      eliminated: false,
      visible: true,
      finalrewards_awarded: false,
      respawns: room.respawns,
      emote: 0,

      // combat shooting
      lastShootTime: 0,
      shooting: false,
      shoot_direction: 90,
      hitmarkers: [],
      eliminations: [],
      can_bullets_bounce: false,
      bullets: new Map(),
      nearbyids: new Set(),
      nearbyplayers: new Set(),

      // movement
      moving: false,
      direction: null,
      direction2: 90,
      moveInterval: null,

      //loadout and gadgets
      loadout: loadout || fallbackloadout,
      loadout_formatted: [loadout[1], loadout[2], loadout[3]].join('$'),
      gadgetid: gadgetselected,
      canusegadget: true,
      gadgetactive: false,
      gadgetcooldown: gadgetconfig[gadgetselected].cooldown,
      gadgetuselimit: gadgetconfig[gadgetselected].use_limit,
      gadgetchangevars: gadgetconfig[gadgetselected].changevariables,

      // network
      ws: ws,
      lastmsg: 0,
      rateLimiter: playerRateLimiter,
      intervalIds: [],
      timeoutIds: [],

      // spectating
      spectatingPlayer: playerId,
      spectateid: 0,
      spectatingTarget: null,
      spectatingplayerid: null,

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

    //newPlayer.loadout[3] = 5
    

    if (newPlayer.gadgetchangevars) {
      for (const [variable, change] of Object.entries(newPlayer.gadgetchangevars)) {
        newPlayer[variable] += Math.round(newPlayer[variable] * change);
      }
    }

    if (room) {
      newPlayer.timeout = newPlayer.timeoutIds.push(setTimeout(() => {
        if (newPlayer.lastPing <= Date.now() - 8000) {

          newPlayer.ws.close(4200, "disconnected_inactivity")
        }
      }, player_idle_timeout));

      room.players.set(playerId, newPlayer);

      if (ws.readyState === ws.CLOSED) {
        RemoveRoomPlayer(room, newPlayer);
        return;
      }
    }


    if (room.state === "waiting" && room.players.size >= room.maxplayers) {

      clearTimeout(room.matchmaketimeout);

      room.state = "await";


      room.maxopentimeout = setTimeout(() => {
        closeRoom(roomId);
      }, room_max_open_time);

      await setupRoomPlayers(room)

      await CreateTeams(room)

      playerchunkrenderer(room)
      SendPreStartMessage(room)



      try {

        //  room.state = "await";

        room.intervalIds.push(setTimeout(() => {

          if (room.matchtype === "td") {

            const t1 = room.teams[0];
            const t2 = room.teams[1];

            room.scoreboard = [
              t1.id,
              t1.score,
              //   t2.id,
              //  t2.score,
            ].join('$')

          }

          room.state = "countdown";
          //  console.log(`Room ${roomId} entering countdown phase`);

          room.timeoutIds.push(setTimeout(() => {
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

          }, game_start_time));

        }, 1000));
      } catch (err) {


      }
    }

    if (ws.readyState === ws.CLOSED) {
      RemoveRoomPlayer(room, newPlayer);
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



  const transformData = (data) => {
    const transformed = {};
    for (const [key, value] of Object.entries(data)) {
      transformed[key] = `${value.x}:${value.y}:${value.health}:${value.starthealth}:${value.type}`;
    }
    return transformed;
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
      ag: player.gadgetactive ? 1 : 0,
      x: player.x,
      y: player.y,
      el: player.eliminations,
      em: player.emote,
      spc: player.spectateid,
      guns: player.loadout_formatted,
      np: player.npfix
    };

    const selfdata = {
      teamdata: player.teamdata,
      pid: player.nmb,
      self_info: selfinfo,
      dummies: room.dummies ? dummiesfiltered : undefined,
      gadget: player.gadgetid,
    };

    const roomdata = {
      mapid: room.map,
      type: room.matchtype,
      sb: room.scoreboard
    };

    const MessageToSend = {
      AllPlayerData: AllPlayerData,
      SelfData: selfdata,
      RoomData: roomdata
      // clientVersion: "v3.5678",
      //roomid: room.roomId
    };

    const FinalPreMessage = JSON.stringify(MessageToSend)

    const compressedPlayerMessage = compressMessage(FinalPreMessage)
    player.ws.send(compressedPlayerMessage, { binary: true })
  });
}





function prepareRoomMessages(room) {
    // Phase 1: Global Room State & Dummies
    handlePlayerMoveIntervalAll(room);

    const isGameRunning = room.state === "playing" || room.state === "countdown";
    const activePlayersCount = Array.from(room.players.values()).reduce((count, player) => count + (!player.eliminated ? 1 : 0), 0);
    const playersValues = Array.from(room.players.values());

    let currentDummiesFiltered;
    // Process dummies data
    if (room.dummies) {
        currentDummiesFiltered = transformData(room.dummies);
        const dummiesHash = generateHash(JSON.stringify(currentDummiesFiltered));

        // Only send dummies if game is running and data has changed from previous tick
        if (isGameRunning) {
            room.dummiesfiltered = (dummiesHash !== room.previousdummies) ? currentDummiesFiltered : undefined;
            room.previousdummies = dummiesHash; // Store hash for next comparison
        } else {
            // Always send dummies if game is not running (e.g., in waiting state)
            room.dummiesfiltered = currentDummiesFiltered;
        }
    } else {
        room.dummiesfiltered = undefined;a
    }


    // Prepare room data string
    let currentRoomData = [
        state_map[room.state],
        room.zone,
        room.maxplayers,
        activePlayersCount,
        "", // Placeholder, as in original code
        room.countdown,
        room.winner,
    ].join(':');

    // Set roomdata to undefined if it hasn't changed from the last tick for this room
    if (currentRoomData === room.rdlast) {
        currentRoomData = undefined;
    }
    room.rdlast = currentRoomData; // Store for next comparison


    // Phase 2: Aggregate Global Player Movement Data (for all visible players)
    // This data is then filtered per player based on proximity later.
    const allVisiblePlayersData = {};
    for (const player of playersValues) {
        if (player.visible === false) continue; // Skip invisible players

        const formattedBullets = {};
        if (player.bullets && player.bullets.size > 0) {
            player.bullets.forEach(bullet => {
                // Ensure bullet_id is unique enough for string keys if not already
                const bullet_id = bullet.bullet_id;
                const x = bullet.x.toFixed(1);
                const y = bullet.y.toFixed(1);
                const direction = Math.round(bullet.direction);
                const gunid = bullet.gunid;
                formattedBullets[bullet_id] = `${bullet_id}=${x},${y},${direction},${gunid};`;
            });
        }

        const finalBulletsString = Object.keys(formattedBullets).length > 0
            ? "$b" + Object.values(formattedBullets).join("")
            : undefined;

        player.finalbullets = finalBulletsString; // Store on player for later use

        if (isGameRunning) {
            allVisiblePlayersData[player.nmb] = [
                player.x,
                player.y,
                player.direction2,
                player.health,
                player.gun,
                player.emote,
                finalBulletsString // Can be undefined
            ].join(':');
        }
    }


    // Phase 3: Prepare Player-Specific Messages
    for (const player of playersValues) {
        // Reset flags/data for the current tick
        player.tick_send_allow = false;
        player.nearbyids = new Set(); // Reset nearby players tracking for this player

        const nearbyFinalIds = player.nearbyfinalids ? Array.from(player.nearbyfinalids) : [];
        const hitmarkers = player.hitmarkers ? Array.from(player.hitmarkers) : [];
        const eliminations = player.eliminations ? Array.from(player.eliminations) : [];

        // Prepare 'selfdata' which contains player's own specific state
        const currentSelfData = {
            id: player.nmb,
            state: player.state,
            h: player.health,
            sh: player.starthealth,
            s: +player.shooting, // Convert boolean to number (0 or 1)
            g: player.gun,
            kil: player.kills,
            dmg: player.damage,
            rwds: [player.place, player.skillpoints_inc, player.seasoncoins_inc].join('$'),
            killer: player.eliminator,
            cg: +player.canusegadget, // Convert boolean to number
            lg: player.gadgetuselimit,
            ag: +player.gadgetactive, // Convert boolean to number
            x: player.x,
            y: player.y,
            el: JSON.stringify(eliminations),
            em: player.emote,
            spc: player.spectateid,
            guns: player.loadout_formatted,
            np: JSON.stringify(nearbyFinalIds),
            ht: JSON.stringify(hitmarkers),
        };

        // Detect changes in selfData to send only changed fields
        const changedSelfDataFields = {};
        let selfDataHasChanges = false;
        // Compare with the last sent data (stored as player.lastSelfData)
        for (const key in currentSelfData) {
            // Check for existence and difference in value
            if (currentSelfData[key] !== player.lastSelfData?.[key]) {
                changedSelfDataFields[key] = currentSelfData[key];
                selfDataHasChanges = true;
            }
        }
        player.lastSelfData = { ...currentSelfData }; // Store a clone for next comparison

        let finalSelfDataToSend = undefined;
        if (isGameRunning) {
            if (selfDataHasChanges) {
                finalSelfDataToSend = changedSelfDataFields;
            }
            // If not in game running state, always send full selfData (or current values)
        } else {
             // In waiting or other non-running states, typically we send the full selfdata
             // or at least the current state, if player state changes less frequently
             finalSelfDataToSend = currentSelfData;
        }


        // Filter nearby player data based on what has changed and who is in range
        let filteredNearbyPlayersData = {};
        if (isGameRunning && player.nearbyplayers) {
            const previousHashes = player.pdHashes || {};
            const currentHashes = {};

            for (const [id, data] of Object.entries(allVisiblePlayersData)) {
                if (player.nearbyplayers.has(+id)) { // Check if the player is in range of THIS player
                    const hash = generateHash(data);
                    if (previousHashes[id] !== hash) {
                        filteredNearbyPlayersData[id] = data;
                    }
                    currentHashes[id] = hash;
                    player.nearbyids.add(id); // Keep track of actually nearby player IDs
                }
            }
            player.nearbyfinalids = player.nearbyids; // Update nearbyfinalids for next tick's selfdata
            player.pd = filteredNearbyPlayersData; // Data for this player's message
            player.pdHashes = currentHashes; // Store hashes for next tick
        } else {
            // Clear player-specific movement data if game is not running
            player.pd = {};
            player.pdHashes = {};
            player.nearbyfinalids = new Set(); // No nearby players if game not running
        }


        // Construct the base message elements (room data and dummies)
        const baseMessageContent = {
            rd: currentRoomData,      // Will be undefined if no change
            dm: room.dummiesfiltered, // Will be undefined if no change
        };

        let playerSpecificMessage;
        if (room.state === "waiting") {
            // In waiting state, usually only room data is necessary to avoid spam
            playerSpecificMessage = { rd: baseMessageContent.rd };
        } else {
            // For active game states, include detailed player-specific and global updates
            const messageEntries = [
                ['rd', baseMessageContent.rd],
                ['dm', baseMessageContent.dm],
                ['kf', room.newkillfeed],    // Assumes newkillfeed is already prepared
                ['sb', room.scoreboard],     // Assumes scoreboard is already prepared
                ['sd', finalSelfDataToSend], // Only includes changed self data or full if not running
                ['WLD', room.destroyedWalls],
                ['cl', player.nearbycircles],       // Assumes nearbycircles is prepared
                ['an', player.nearbyanimations],    // Assumes nearbyanimations is prepared
                ['b', player.finalbullets],         // Player's own bullets
                ['pd', player.pd],                  // Filtered nearby player movement data
            ];

            // Build message object, filtering out empty/undefined values
            playerSpecificMessage = Object.fromEntries(
                messageEntries.filter(([key, value]) => {
                    // Filter out undefined, null, empty arrays, or empty objects
                    if (value === undefined || value === null) return false;
                    if (Array.isArray(value) && value.length === 0) return false;
                    if (typeof value === 'object' && Object.keys(value).length === 0) return false;
                    return true;
                })
            );
        }

        // Phase 4: Hash, Compress, and Mark for Sending
        const currentMessageHash = generateHash(JSON.stringify(playerSpecificMessage));
        
        // Only prepare to send if the message content has actually changed
        if (player.ws && player.lastMessageHash !== currentMessageHash) {
            player.lastcompressedmessage = compressMessage(JSON.stringify(playerSpecificMessage));
            player.tick_send_allow = true; // Flag to indicate this player's message should be sent this tick
            player.lastMessageHash = currentMessageHash;
        } else {
            player.tick_send_allow = false; // No change, no need to send
        }
    }

    // Phase 5: Cleanup for Next Tick
    room.destroyedWalls = []; // Clear walls for next tick

    // Clear player-specific transient data that should be fresh each tick
    for (const player of room.players.values()) {
        player.hitmarkers = [];
        player.eliminations = [];
        // Note: player.nearbycircles and player.nearbyanimations also likely need clearing elsewhere
        // or ensure they are reset/updated by their own logic for the next tick.
    }
}



function sendRoomMessages(room) {

  room.players.forEach(player => {

    if (player.tick_send_allow) {

      player.ws.send(player.lastcompressedmessage, { binary: true });

    }

  })

}

function createRoom(roomId, gamemode, gmconfig, splevel) {


  let mapid
  if (gmconfig.custom_map) {
    mapid = gmconfig.custom_map
  } else {

    const keyToExclude = "training";
    const prefix = "";

    // Get all keys of the object, excluding the one you don't want and those that don't start with the prefix
    const filteredKeys = Object.keys(mapsconfig)
      .filter(key => key !== keyToExclude && key.startsWith(prefix));

    // Check if there are any valid keys left
    if (filteredKeys.length > 0) {
      // Select a random index from the filtered keys
      const randomIndex = Math.floor(Math.random() * filteredKeys.length);
      mapid = filteredKeys[randomIndex];
    }
  }

  const itemgrid = new SpatialGrid(gridcellsize); // grid system for items

  const bulletgrid = new SpatialGrid(50);

  const roomgrid = cloneSpatialGrid(mapsconfig[mapid].grid)


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
    bulletsUpdates: [],
    players: new Map(),
    snap: [],
    state: "waiting", // Possible values: "waiting", "playing", "countdown"
    timeoutIds: [],
    winner: -1,

    // Game Configuration
    itemgrid: itemgrid,
    bulletgrid: bulletgrid,
    maxplayers: gmconfig.maxplayers,
    modifiers: gmconfig.modifiers,
    place_counts: gmconfig.placereward,
    respawns: gmconfig.respawns_allowed,
    showtimer: gmconfig.show_timer,
    sp_level: splevel,
    ss_counts: gmconfig.seasoncoinsreward,
    teamsize: gmconfig.teamsize,
    weapons_modifiers_override: gmconfig.weapons_modifiers_override,

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



  if (gmconfig.can_hit_dummies && mapsconfig[mapid].dummies) {
    room.dummies = deepCopy(mapsconfig[mapid].dummies) //dummy crash fix
  }

  const roomConfig = {
    canCollideWithDummies: gmconfig.can_hit_dummies, // Disable collision with dummies
    canCollideWithPlayers: gmconfig.can_hit_players,// Enable collision with players
  };

  room.config = roomConfig


  addRoomToIndex(room)
  rooms.set(roomId, room);



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
  }, 1000);


  room.matchmaketimeout = setTimeout(() => {

    room.players.forEach(player => {
    player.ws.send("matchmaking_timeout")
    })

    closeRoom(roomId);

  }, matchmaking_timeout);


  // Start sending batched messages at regular intervals
  // in ms
  room.intervalIds.push(setInterval(() => { // this could take some time...

    prepareRoomMessages(room);

    setTimeout(() => {
      sendRoomMessages(room);
    }, 3);

  }, server_tick_rate));



  // room.intervalId = intervalId;
  room.timeoutIds.push(setTimeout(() => {


    room.intervalIds.push(setInterval(() => {

      if (room) {
        cleanupRoom(room);
      }
    }, 1000));
  }, 10000));


  // Countdown timer update every second


  // console.log("Room", room.roomId, "created")
  return room;
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
