const { SkillbasedMatchmakingEnabled, gadgetconfig, matchmakingsp, PlayerRateLimiter, gamemodeconfig } = require("@main/modules");
const { getAvailableRoom, removeRoomFromIndex } = require("./roomIndex");
const { Room } = require("./CreateRoom");
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


function generateUUID() {
  return "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8; // Ensures UUID version 4
    return v.toString(16);
  });
}

class Player {
  constructor(ws, playerVerified, room) {
    const {
      playerId,
      nickname,
      hat,
      top,
      player_color,
      hat_color,
      top_color,
      loadout,
      gadget,
    } = playerVerified;

    const gamemodeSettings = room.gameconfig;
    const gadgetselected = gadget || 1;
    const gadgetdata = gadgetconfig.get(`${gadgetselected}`);
    const fallbackloadout = { slot1: "1", slot2: "2", slot3: "3" };

    const NICKNAME_SANITIZE = /[:$]/g;
    this.playerId = playerId;
    this.nickname = nickname.replace(NICKNAME_SANITIZE, "");
    this.hat = hat;
    this.top = top;
    this.player_color = player_color;
    this.hat_color = hat_color;
    this.top_color = top_color;

    // Game state
    this.health = gamemodeSettings.playerhealth;
    this.starthealth = gamemodeSettings.playerhealth;
    this.speed = gamemodeSettings.playerspeed;
    this.startspeed = gamemodeSettings.playerspeed;
    this.damage = 0;
    this.kills = 0;
    this.place = null;
    this.state = 1;
    this.alive = true;
    this.eliminated = false;
    this.finalrewards_awarded = false;
    this.respawns = room.respawns;
    this.emote = 0;
    this.seenObjectsIds = new Set(),
    this.lastNearbyObjects =  new Set(),


    this.serializeBuffer = new Array(7)
    this.bulletBuffer = [];
    this.msgBuffer = [];
    this.filteredPlayersBuffer = [];
    this.selflastmsg = {};
    this.pdHashes = {};
    this.latestnozeropd = [];
    this.pd = 0;
    this.spectating = false
    this.pdHashes = {};

    this.newSeenObjectsStatic = [];
    this.nearbyanimations = [];
    this.hitmarkers = [];
    this.eliminations = [];
    this.emptySent = false;

    this.lastdata = [];
    this.dirty = true;

    // Movement
    this.moving = false;
    this.direction = null;
    this.direction2 = 90;
    this.moveInterval = null;

    // Loadout & gadgets
    this.loadout = loadout || fallbackloadout;
    this.loadout_formatted = [this.loadout["slot1"], this.loadout["slot2"], this.loadout["slot3"]].join("$");
    this.gun = this.loadout["slot1"];
    this.gadgetid = gadgetselected;
    this.canusegadget = true;
    this.gadgetactive = false;
    this.gadgetcooldown = gadgetdata.cooldown;
    this.gadgetuselimit = gadgetdata.use_limit;
    this.gadgetchangevars = gadgetdata.changevariables;

    if (this.gadgetchangevars) {
      for (const [variable, change] of Object.entries(this.gadgetchangevars)) {
        this[variable] += Math.round(this[variable] * change);
      }
    }

    // Combat & networking
    this.lastShootTime = 0;
    this.shooting = false;
    this.shoot_direction = 90;
    this.hitmarkers = [];
    this.eliminations = [];
    this.nearbyanimations = [];
    this.can_bullets_bounce = false;
    this.nearbyplayersids = [];
    this.lastplayerids = [];
    this.isPlayer = true

    // Network methods
    this.wsClose = (code, msg) => ws.close(code, msg);
    this.send = (msg) => { if (ws.readyState === ws.OPEN) ws.send(msg); };
    this.wsReadyState = () => ws.readyState;
    this.wsOpen = () => ws.readyState === ws.OPEN;

    this.lastPing = Date.now();
    this.pingnow = 0;
    this.ping_ms = 0;
    this.lastmsg = 0;
    this.rateLimiter = PlayerRateLimiter();

    // Spectating
    this.spectating = false;
    this.spectatingPlayer = playerId;
    this.spectateid = 0;
    this.spectatingTarget = null;
    this.spectatingPlayerId = -1;

    // Final rewards
    this.finalrewards = [],

    this.room = room;
  }

  useGadget() {
    if (this.room && this.room.state === "playing" && this.alive) {
      const gadgetdata = gadgetconfig.get(`${this.gadgetid}`);
      gadgetdata.gadget(this, this.room);
    } else {
      console.error("Player not found or cannot use gadget");
    }
  }
}



async function AddPlayerToRoom(ws, gamemode, playerVerified) {
  try {
    const max_length = 16;
    const min_length = 4;
    const nickname = playerVerified.nickname;
    const gadgetselected = playerVerified.gadget || 1;

    if (nickname.length < min_length || nickname.length > max_length || !gadgetconfig.has(`${gadgetselected}`)) {
      return ws.close(4004);
    }

    const finalskillpoints = SkillbasedMatchmakingEnabled ? playerVerified.skillpoints || 0 : 0;

    const roomjoiningvalue = matchmakingsp(finalskillpoints);

    let roomId, room;
    const availableRoom = getAvailableRoom(gamemode, roomjoiningvalue);
    const gamemodeSettings = gamemodeconfig.get(gamemode);

    if (availableRoom) {
      roomId = availableRoom.roomId;
      room = availableRoom;
    } else {
      roomId = generateUUID();
      room = new Room(roomId, gamemode, gamemodeSettings, roomjoiningvalue);
    }

    const newPlayer = new Player(ws, playerVerified, room);

    if (room && !room.canStartGame()) {
      room.addPlayer(newPlayer.playerId, newPlayer);
      playerLookup.set(newPlayer.playerId, newPlayer);

      if (newPlayer.wsReadyState() === ws.CLOSED) {
        RemovePlayerFromRoom(room, newPlayer);
        return;
      }
    }

    if (room.canStartGame()) {
      room.state = "await";
      removeRoomFromIndex(room);
      clearTimeout(room.matchmaketimeout);
      await startMatch(room, roomId);
    }

    return { room, playerId: newPlayer.playerId };
  } catch (error) {
    console.error("Error joining room:", error);
    ws.close(4000, "Error joining room");
    throw error;
  }
}



module.exports = { AddPlayerToRoom }