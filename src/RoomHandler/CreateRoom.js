const { random_mapkeys, mapsconfig, game_tick_rate, player_idle_timeout, deepCopy, matchmaking_timeout } = require("@main/modules");
const { rooms, closeRoom } = require("./setup");
const { BulletManager } = require("../Battle/WeaponLogic/bullets");
const { addRoomToIndex } = require("./roomIndex");
const { prepareRoomMessages, sendRoomMessages } = require("../Battle/NetworkLogic/Packets");
const { handlePlayerMoveIntervalAll } = require("../Battle/NetworkLogic/HandleMessage");
const { playerchunkrenderer } = require("../Battle/PlayerLogic/playerchunks");
const { HandleAfflictions } = require("../Battle/WeaponLogic/bullets-effects");

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
    IsTeamMode: gmconfig.teamsize > 1,
    matchtype: gmconfig.matchtype,
    players: new Map(),
    eliminatedTeams: [],
    currentplayerid: 0, // for creating playerids start at 0

    killfeed: [],
    objects: [],

    winner: -1,
    countdown: null,

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
   // destroyedWalls: [],

    // clear interval ids
    intervalIds: [],
    timeoutIds: [],

    lastglobalping: 0,
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
        if (player.lastPing <= now - player_idle_timeout || !player.wsOpen()) {
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
  playerchunkrenderer(room);
  handlePlayerMoveIntervalAll(room);
  HandleAfflictions(room);

    }, game_tick_rate - 1)
  );

  room.intervalIds.push(
    setInterval(() => {
     // console.time('myFunction');
      prepareRoomMessages(room);
     // console.timeEnd('myFunction');
      room.timeoutdelaysending = setTimeout(() => {
        sendRoomMessages(room);
      }, 3);
    }, game_tick_rate)
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

module.exports = { createRoom };
