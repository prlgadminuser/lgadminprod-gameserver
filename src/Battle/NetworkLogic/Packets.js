const { arraysEqual } = require("@main/modules");
const { compressMessage } = require("./compress");
const { playerchunkrenderer } = require("../PlayerLogic/playerchunks");
const { handlePlayerMoveIntervalAll } = require("@Battle/NetworkLogic/HandleMessage");
const { handleSpectatorMode } = require("../PlayerLogic/spectating");
const { HandleAfflictions } = require("../WeaponLogic/bullets-effects");
const { encodePosition } = require("../utils/game");


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

const PacketKeys = {
  roomdata: 1,
  selfdata: 2,
  playerdata: 3,
  bulletdata: 4,
  objectupdates: 5,
  animations: 6,
  killfeed: 7,
};



const transformData = (data) => {
  const transformed = {};
  for (const [key, value] of Object.entries(data)) {
    transformed[key] = [value.x, value.y, value.health, value.type];
  }
  return transformed;
};


function BuildSelfData(p) {

//  const dataSource =  p.spectatingTarget ? p.spectatingTarget : p;

const dataSource = p;

  const selfdata = {
    state: p.state,
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
    np: !arraysEqual(dataSource.nearbyplayersids, dataSource.lastplayerids) ? dataSource.nearbyplayersids : undefined,
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
    plspeed: room.playerspeed,
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
  const arr = p.serializeBuffer
  arr[0] = p.id;
  arr[1] = encodePosition(p.x);
  arr[2] = encodePosition(p.y);
  arr[3] = p.direction2;
  arr[4] = p.health;
  arr[5] = Number(p.gun);
  arr[6] = Number(p.emote);
  return arr;
}

const CachedEmptyMsg = compressMessage([]);

function preparePlayerPackets(room) {
  const players = Array.from(room.players.values());
  const GameRunning = room.state === "playing" || room.state === "countdown";

  if (!GameRunning) {
    const roomdata = [state_map[room.state], room.maxplayers, players.length];

    const sendroomdata = [PacketKeys["roomdata"], roomdata];

    for (const p of players) p.tick_send_allow = false;

    if (!arraysEqual(room.rdlast, roomdata)) {
      room.rdlast = roomdata;
      const compressed = compressMessage(sendroomdata);
      for (const p of players) {
        if (!p.wsReadyState()) continue;
        p.lastcompressedmessage = compressed;
        p.tick_send_allow = true;
        p.lastMessageHash = "default";
      }
    }
    return;
  }

  const aliveCount = players.reduce((c, p) => c + !p.eliminated, 0);
  room.bulletManager.update();
  HandleAfflictions(room);
  playerchunkrenderer(room);
  handlePlayerMoveIntervalAll(room);

  // ROOM DATA
  const roomdata = [
    state_map[room.state],
    room.maxplayers,
    aliveCount,
    room.countdown,
    room.winner,
    room.zone,
  ];

 let finalroomdata

 if (!arraysEqual(room.rdlast, roomdata)) {

   finalroomdata = roomdata
   room.rdlast = roomdata
 } else {

  finalroomdata = undefined

 }
  

  // Reuse buffers for bullets and player data
  const playerData = room.playerDataBuffer 

  for (const p of players) {
    if (p.spectating) continue;

    const nearbyBullets = p.nearbybullets;
    let finalBullets = p.bulletBuffer;
    finalBullets.length = 0; // Create a Set of previously sent bullet IDs
    const lastBulletIds = p.lastfinalbulletsSet

    const newLastBulletIds = new Set();

    if (nearbyBullets) {
      for (const bullet of nearbyBullets.values()) {
        const alreadySent = lastBulletIds.has(bullet.id);
        if (alreadySent) {
          finalBullets.push([bullet.id]);
        } else {
          finalBullets.push([
            bullet.id,
            bullet.serialized.x,
            bullet.serialized.y,
            bullet.serialized.d,
            bullet.gunId,
            bullet.effect,
            bullet.speed,
          ]);
        }
        newLastBulletIds.add(bullet.id);
      }
    }

    p.finalbullets = finalBullets.length ? finalBullets : undefined; 
    p.lastfinalbulletsSet = newLastBulletIds;

    if (!p.alive) continue;

    const serialized = SerializePlayerData(p);

    const hash = serialized.join();

    p.dirty = hash !== p._lastSerializedHash;
    p._lastSerializedHash = hash;

    playerData.set(p.id, serialized);
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
    if (Object.keys(changes).length) p.selflastmsg = { ...lastSelf, ...changes };

    if (p.spectating) handleSpectatorMode(p, room);

    if (!p.spectating) {
      const filteredPlayers = p.filteredPlayersBuffer

      filteredPlayers.length = 0

      for (const player of p.nearbyplayers) {
        if (player.dirty || !p.nearbyplayersidslast.includes(player.id)) {          
          const data = playerData.get(player.id); 
          filteredPlayers.push(data); // if data is dirty or playerid is new from last tick then sent

        }
      }

      if (filteredPlayers.length > 0)  p.latestnozeropd = filteredPlayers;

      p.pd = filteredPlayers
      p.nearbyplayersidslast = p.nearbyplayersids
    }



    // --- Message assembly with buffer reuse ---
    const msgArray = p.msgBuffer;
    msgArray.length = 0;

    const dataSource = p.spectatingTarget ? p.spectatingTarget : p;

    // always send also for spectators
    if (finalroomdata) msgArray.push(PacketKeys["roomdata"], finalroomdata);
    if (Object.keys(changes).length) msgArray.push(PacketKeys["selfdata"], changes);
    if (p.newSeenObjectsStatic) msgArray.push(PacketKeys["objectupdates"], p.newSeenObjectsStatic);
    if (room.killfeed.length) msgArray.push(PacketKeys["killfeed"], room.killfeed);
    
    // for normal players and spectator handling
    if (dataSource.nearbyanimations.length) msgArray.push(PacketKeys["animations"], dataSource.nearbyanimations);
    if (dataSource.finalbullets) msgArray.push(PacketKeys["bulletdata"], dataSource.finalbullets);
    if (p.pd.length) msgArray.push(PacketKeys["playerdata"], p.pd);

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
      p.lastnotemptymessage = compressed
      p.tick_send_allow = true;
      p.emptySent = false;
    }
  }

  // CLEANUP
  room.killfeed.length = 0;
  for (const p of players) {
    p.hitmarkers.length = 0;
    p.eliminations.length = 0;
    p.nearbyanimations.length = 0;
  }

}



function sendPlayerPackets(room) {
  room.players.forEach((player) => {
    if (player.tick_send_allow) {
      player.send(player.lastcompressedmessage, { binary: true });
    }
  });
}


module.exports = { SendPreStartMessage, preparePlayerPackets, sendPlayerPackets }