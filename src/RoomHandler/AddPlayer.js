const { SkillbasedMatchmakingEnabled, gadgetconfig, matchmakingsp, PlayerRateLimiter, gamemodeconfig } = require("@main/modules");
const { getAvailableRoom, removeRoomFromIndex } = require("./roomIndex");
const { createRoom } = require("./CreateRoom");
const { startMatch } = require("./StartGame");
const { RemovePlayerFromRoom } = require("./RemovePlayer");
const { playerLookup } = require("./setup");

function generateUUID() {
  return "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8; // Ensures UUID version 4
    return v.toString(16);
  });
}


async function AddPlayerToRoom(ws, gamemode, playerVerified) {
  try {
    const {
      playerId,
      nickname,
      hat,
      top,
      player_color,
      hat_color,
      top_color,
      skillpoints,
      loadout,
      gadget,
    } = playerVerified;

    //const fallbackloadout = { 1: "1", 2: "5", 3: "DEVLOCKED" }
    if (playerVerified.length > 200) {
      return ws.close(4004);
    }

    const max_length = 16;
    const min_length = 4;
    const gadgetselected = gadget || 1;
    const fallbackloadout = { slot1: "1", slot2: "2", slot3: "3" };
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

    const playerRateLimiter = PlayerRateLimiter();

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

      lastdata: [],
      dirty: true,

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

      seenObjectsIds: new Set(),
      // combat shooting

      lastShootTime: 0,
      shooting: false,
      shoot_direction: 90,
      hitmarkers: [],
      eliminations: [],
      nearbyanimations: [],
      can_bullets_bounce: false,
      nearbyplayersids: [],
      lastplayerids: [],
      // movement
      moving: false,
      direction: null,
      direction2: 90,
      moveInterval: null,

      //loadout and gadgets
      loadout: loadout || fallbackloadout,
      loadout_formatted: [loadout["slot1"], loadout["slot2"], loadout["slot3"]].join("$"),
      gadgetid: gadgetselected,
      canusegadget: true,
      gadgetactive: false,
      gadgetcooldown: gadgetdata.cooldown,
      gadgetuselimit: gadgetdata.use_limit,
      gadgetchangevars: gadgetdata.changevariables,

      // network
     // ws,
      wsClose: (code, msg) => ws.close(code, msg),
      send: (msg) => {
        if (ws.readyState === ws.OPEN) ws.send(msg);
      },
      wsReadyState: () => ws.readyState,
      wsOpen: () => ws.readyState === ws.OPEN,


      lastPing: Date.now(),
      pingnow: 0,
      ping_ms: 0,

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

    newPlayer.gun = newPlayer.loadout["slot1"];

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
      playerLookup.set(playerId, newPlayer);

      if (newPlayer.wsReadyState() === ws.CLOSED) {
        RemovePlayerFromRoom(room, newPlayer);
        return;
      }
    }

    if (room.players.size >= room.maxplayers && room.state === "waiting") {

      room.state = "await";
      removeRoomFromIndex(room)
      clearTimeout(room.matchmaketimeout);
      await startMatch(room, roomId);
    }

    return { room, playerId };
  } catch (error) {
    console.error("Error joining room:", error);
    ws.close(4000, "Error joining room");
    throw error;
  }
}


module.exports = { AddPlayerToRoom }