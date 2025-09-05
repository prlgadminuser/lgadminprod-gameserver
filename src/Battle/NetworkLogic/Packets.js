const { arraysEqual } = require("@main/modules");
const { compressMessage } = require("./compress");
const { playerchunkrenderer } = require("../PlayerLogic/playerchunks");
const { handlePlayerMoveIntervalAll } = require("@Battle/NetworkLogic/HandleMessage");
const { handleSpectatorMode } = require("../PlayerLogic/spectating");
const { HandleAfflictions } = require("../WeaponLogic/bullets-effects");

function encodePosition(num) {
  return Math.round(num * 100); // keep 2 decimals
  // Math.floor(p.x * 10)
}

function getTeamIds(room, player) {
    // 1. Get the player's team object from the room's teams map.
    const playerTeam = room.teams.get(player.teamId);

    if (!playerTeam) {
        // Handle cases where the team doesn't exist (e.g., player is not in a team yet).
        return [];
    }

    // 2. Map the players array to get their IDs.
    const teammateIds = playerTeam.players.map(p => p.id);

    return teammateIds;
}

const state_map = {
  waiting: 1,
  await: 2,
  countdown: 3,
  playing: 4,
};



const transformData = (data) => {
  const transformed = {};
  for (const [key, value] of Object.entries(data)) {
    transformed[key] = [value.x, value.y, value.health, value.type];
  }
  return transformed;
};

function BuildSelfData(p) {
  const selfdata = {
    state: p.state,
   // pr: p.pingnow,
  //  ping: p.ping_ms,
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
    np: !arraysEqual(p.nearbyplayersids, p.lastplayerids) ? p.nearbyplayersids : undefined,
    ht: p.hitmarkers.length > 0 ? p.hitmarkers : undefined,
  };

  p.lastplayerids = p.nearbyplayersids

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
    AllData[p.id] = [
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
      id: player.id,
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
      ht: [],
    };

    player.selflastmsg = self_info;

    const MessageToSend = {
      AllData,
      SelfData: {
        allies: getTeamIds(room, player),
        pid: player.id,
        self_info,
        dummies: dummiesFiltered,
        gadget: player.gadgetid,
      },
      RoomData: RoomData,
    };

    player.send(compressMessage(MessageToSend), { binary: true });
  }
}

function SerializePlayerData(p) {

return  [
      p.id,
      encodePosition(p.x),
      encodePosition(p.y),
      p.direction2, // convert to number if it might be string
      p.health,
      Number(p.gun),
      Number(p.emote),
    ];
}

const CachedEmptyMsg = compressMessage({})


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
  room.bulletManager.update();
  playerchunkrenderer(room);
  handlePlayerMoveIntervalAll(room);
  HandleAfflictions(room);

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
          bullet.serialized.x,
          bullet.serialized.y,
          bullet.serialized.d,
          bullet.gunId,
          bullet.effect,
        ]);
      }
    }

    p.finalbullets = finalBullets.length > 0 ? finalBullets : undefined;

    if (!p.alive) continue;
    //  Math.floor(p.x / 10)
    
    playerData[p.id] = SerializePlayerData(p)
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


    if (p.spectating) handleSpectatorMode(p, room);

    if (!p.spectating) {

      let filteredPlayers = [];

      const playersInRange = p.nearbyplayersids;
      const previousData = p.pdHashes || {};
      const currentData = {};

      for (const nearbyId of playersInRange) {
        const data = playerData[nearbyId];
        if (!data) continue;

        if (!arraysEqual(previousData[nearbyId], data)) {
          filteredPlayers.push(data);
        }

        currentData[nearbyId] = data;

        if (filteredPlayers.length > 0) p.latestnozeropd = filteredPlayers
        p.pd = filteredPlayers;
        p.pdHashes = currentData;
      }
   }

    // Message assembly

   // const statefrom = p.spectating && p.spectatingPlayer && p.spectatingPlayer.alive ? p.spectatingPlayer : p

    const msg = {
      r: finalroomdata,
      kf: room.killfeed,
      sd: Object.keys(changes).length ? changes : undefined,
    //  cl: p.nearbycircles,
      an: p.nearbyanimations,
      ons: p.newSeenObjects, //objects not seen
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
    // Track if the empty message has been sent
if (!p.emptySent) p.emptySent = false;

let hash;

// If msg is empty, set hash to "{}"
if (Object.keys(msg).length === 0) {
  hash = "{}";
} else {
  hash = 0;
}

// Determine if we should send
  // If msg is empty, only send if we haven't sent empty before
if (hash === "{}") {

    if (!p.emptySent) {
      p.lastcompressedmessage = CachedEmptyMsg;
      p.tick_send_allow = true;
      p.emptySent = true; // mark empty msg as sent
    } else {
      p.tick_send_allow = false;
    }

  } else {
    // Non-empty msg
    p.lastcompressedmessage = compressMessage(msg);
    p.tick_send_allow = true;
    p.emptySent = false; 
  } 
}
  // CLEANUP
  
  room.killfeed = [];
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


module.exports = { SendPreStartMessage, prepareRoomMessages, sendRoomMessages }