const round_player_pos_sending = true// provides 50% better compression but couldnt look smooth enough

//const round_player_pos_sending = false; // Better compression but less smooth

function arraysEqual(a, b) {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; ++i) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function prepareRoomMessages(room) {
  const players = Array.from(room.players.values());
  const GameRunning = room.state === "playing" || room.state === "countdown";

  // WAITING STATE
  if (!GameRunning) {
    const roomdata = [state_map[room.state], room.maxplayers, players.length];
    const roomdatahash = generateHash(roomdata);

    for (const p of players) p.tick_send_allow = false;

    if (roomdatahash !== room.rdlast) {
      room.rdlast = roomdatahash;
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
  handlePlayerMoveIntervalAll(room);

  // DUMMIES (once)
  let dummiesFiltered;
  if (room.dummies) {
    const transformed = transformData(room.dummies);
    const hash = deepHash(transformed);
    if (hash !== room.previousdummies) {
      room.dummiesfiltered = transformed;
      room.previousdummies = hash;
    } else {
      room.dummiesfiltered = undefined;
    }
    dummiesFiltered = room.dummiesfiltered;
  }

  // ROOM DATA (once)
  const roomdata = [
    state_map[room.state],
    room.maxplayers,
    aliveCount,
    room.countdown,
    room.winner,
    room.zone,
  ];
  const roomdatahash = generateHash(roomdata);
  const finalroomdata = roomdatahash !== room.rdlast ? (room.rdlast = roomdatahash, roomdata) : undefined;

  // PLAYER DATA (once)
  const playerData = {};
  const playerDataHashes = {};

  for (const p of players) {
    if (p.spectating) handleSpectatorMode(p, room);
    if (!p.visible) continue;

    const formattedBullets = {};
    const playerBullets = room.bulletManager.bullets.get(p.playerId);
    if (playerBullets) {
      for (const bullet of playerBullets.values()) {
        formattedBullets[bullet.id] = [
          Math.round(bullet.position.x),
          Math.round(bullet.position.y),
          Math.round(bullet.direction),
          bullet.gunId,
        ];
      }
    }

    const finalBullets = Object.keys(formattedBullets).length > 0 ? formattedBullets : undefined;
    p.finalbullets = finalBullets;

    const pdata = [
      round_player_pos_sending ? Math.round(p.x) : p.x,
      round_player_pos_sending ? Math.round(p.y) : p.y,
      p.direction2,
      p.health,
      p.gun,
      p.emote,
      finalBullets,
    ];

    playerData[p.nmb] = pdata;
    playerDataHashes[p.nmb] = generateHash(pdata);
  }

  // PER-PLAYER MESSAGE ASSEMBLY
  for (const p of players) {
    if (!p.wsReadyState()) continue;

    // Cache nearby set only if changed
    const currentNearby = p.nearbyplayers || [];
    if (!arraysEqual(currentNearby, p._cachedNearbyIds)) {
      p._cachedNearbyIds = currentNearby;
      p.nearbyplayersSet = new Set(currentNearby);
    }

    const nearbySet = p.nearbyplayersSet;
    const nearbyIdsArray = p.nearbyfinalids ? Array.from(p.nearbyfinalids) : [];

    // SELF DATA diffing
    const selfdata = {
      id: p.nmb,
      state: p.state,
      h: p.health,
      sh: p.starthealth,
      s: +p.shooting,
      g: p.gun,
      kil: p.kills,
      dmg: p.damage,
      rwds: p.finalrewards.length > 0 ? p.finalrewards : undefined,
      killer: p.eliminator,
      cg: +p.canusegadget,
      lg: p.gadgetuselimit,
      ag: +p.gadgetactive,
      x: round_player_pos_sending ? Math.round(p.x) : p.x,
      y: round_player_pos_sending ? Math.round(p.y) : p.y,
      el: p.eliminations.length > 0 ? p.eliminations : undefined,
      em: p.emote,
      spc: p.spectatingPlayerId,
      guns: p.loadout_formatted,
      np: nearbyIdsArray.length > 0 ? JSON.stringify(nearbyIdsArray) : undefined,
      ht: p.hitmarkers.length > 0 ? p.hitmarkers : undefined,
    };

    const changes = {};
    const lastSelf = p.selflastmsg || {};
    for (const k in selfdata) {
      if (selfdata[k] !== lastSelf[k]) changes[k] = selfdata[k];
    }
    if (Object.keys(changes).length) {
      p.selflastmsg = { ...lastSelf, ...changes };
    }

    // Filtered player data (diff by hash)
    if (!p.nearbyids) p.nearbyids = new Set();
    p.nearbyids.clear();

    const filteredplayers = {};
    const previousHashes = p.pdHashes || {};
    const currentHashes = {};

    for (const [id, data] of Object.entries(playerData)) {
      if (!nearbySet || !nearbySet.has(+id)) continue;

      const hash = playerDataHashes[id];
      if (previousHashes[id] !== hash) {
        filteredplayers[id] = data;
      }
      currentHashes[id] = hash;
      p.nearbyids.add(id);
    }

    p.nearbyfinalids = p.nearbyids;
    p.pd = filteredplayers;
    p.pdHashes = currentHashes;

    // Final message assembly
    const msg = {};
    if (finalroomdata) msg.r = finalroomdata;
    if (dummiesFiltered) msg.dm = dummiesFiltered;
    if (room.newkillfeed && room.newkillfeed.length > 0) msg.kf = room.newkillfeed;
    if (room.scoreboard) msg.sb = room.scoreboard;
    if (Object.keys(changes).length) msg.sd = changes;
    if (room.destroyedWalls.length) msg.WLD = room.destroyedWalls;
    if (p.nearbycircles && p.nearbycircles.length > 0) msg.cl = p.nearbycircles;
    if (p.nearbyanimations && p.nearbyanimations.length > 0) msg.an = p.nearbyanimations;
    if (p.finalbullets) msg.b = p.finalbullets;
    if (Object.keys(p.pd).length) msg.pd = p.pd;

    // Send only if changed
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
  room.destroyedWalls = [];
  for (const p of players) {
    p.hitmarkers = [];
    p.eliminations = [];
    // p.nearbyanimations = [];
  }
}
