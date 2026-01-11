
const { gadgetconfig } = require("../config/gadgets");
const { playerhitbox } = require("../config/player");
const { PlayerRateLimiter } = require("../config/server");
const { UpdatePlayerPlace } = require("../database/ChangePlayerStats");
const { spawnAnimation } = require("../modifiers/animations");
const { addEntryToKillfeed } = require("../modifiers/killfeed");
const { startSpectatingLogic } = require("../PlayerLogic/spectating");
const { TeamPlayersActive } = require("../teamhandler/aliveteam");
const { isCollisionWithCachedWalls } = require("../utils/collision");
const { createHitmarker } = require("../utils/game");
const { DIRECTION_VECTORS } = require("../utils/movement");

const added_hitbox = 5;
const hitboxXMin = playerhitbox.xMin + added_hitbox;
const hitboxXMax = playerhitbox.xMax + added_hitbox;
const hitboxYMin = playerhitbox.yMin + added_hitbox;
const hitboxYMax = playerhitbox.yMax + added_hitbox;

const viewmultiplier = 1;
const xThreshold = 420 * viewmultiplier;
const yThreshold = 240 * viewmultiplier;

class Player {
  constructor(ws, playerVerified, room) {
    const {
      userId,
      playername,
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
    this.gadgetdata = gadgetconfig[gadgetselected];
    const fallbackloadout = { slot1: "1", slot2: "2", slot3: "3" };

    this.playerId = userId;
    this.playername = playername.replace(/[:$]/g, "");
    this.hat = hat;
    this.top = top;
    this.player_color = player_color;
    this.hat_color = hat_color;
    this.top_color = top_color;

    // Game state
    this.type = "player";
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
    this.lastNearbyObjects = new Set(),
    this.ticksSinceLastChunkUpdate = 100; // make number high so first chunk update occurs immediately

    this._lastSerializedHash = 0;
    this.dirty = true;
    this.nearbyplayersidslast = [];

    this.lastfinalbulletsSet = new Set();

    this.serializeBuffer = new Array(7);
    this.bulletBuffer = [];
    this.msgBuffer = [];
    this.filteredPlayersBuffer = [];
    this.selflastmsg = {};
    this.pdHashes = {};
    this.latestnozeropd = [];
    this.pd = 0;
    this.spectating = false;
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
    this.loadout_formatted = [
      this.loadout["slot1"],
      this.loadout["slot2"],
      this.loadout["slot3"],
    ].join("$");
    this.gun = this.loadout["slot1"];
    this.gadgetid = gadgetselected;
    this.canusegadget = true;
    this.gadgetactive = false;
    this.gadgetcooldown = this.gadgetdata.cooldown;
    this.gadgetuselimit = this.gadgetdata.use_limit;
    this.gadgetchangevars = this.gadgetdata.changevariables;

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
    this.isPlayer = true;

    // Network methods
    this.wsClose = (code, msg) => ws.close(code, msg);
    this.send = (msg) => {
      if (ws.readyState === ws.OPEN) ws.send(msg);
    };
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
    (this.finalrewards = []), (this.room = room);
    this.UseStartRespawnPoint = false;
  }

  IsEliminationAllowed() {
    return this.health <= 0 && this.respawns <= 0 && this.room.state === "playing";
  }


  GiveAssistElimination(targetPlayer) {

    const elimType = 1;
    const ElimMessage = [elimType, targetPlayer.id];
    this.eliminations.push(ElimMessage);
   
   this.kills += 1;
  }



  HandleSelfBulletsOtherPlayerCollision(targetPlayer, damage, gunid) {
    const room = this.room; // current player's room (the shooter)
    const GUN_BULLET_DAMAGE = Math.min(damage, targetPlayer.health);

    targetPlayer.health -= GUN_BULLET_DAMAGE;
    this.damage += GUN_BULLET_DAMAGE;
    targetPlayer.last_hit_time = Date.now();
    targetPlayer.last_hitter = this; // Track who last hit the player

    createHitmarker(targetPlayer, this, GUN_BULLET_DAMAGE)

    const teamActivePlayers = TeamPlayersActive(room, targetPlayer);

    // ✅ Player completely eliminated (no respawns left, last one on team)
    if (
      targetPlayer.health <= 0 &&
      targetPlayer.respawns <= 0 &&
      teamActivePlayers <= 1
    ) {
      const elimType = 1;
      const ElimMessage = [elimType, targetPlayer.id];
      this.eliminations.push(ElimMessage);

      targetPlayer.eliminate();
      addEntryToKillfeed(room, 1, this.id, targetPlayer.id, gunid);

      targetPlayer.eliminator = this.id;
      targetPlayer.spectatingTarget = this;
      this.kills += 1;
    }

    // ✅ Player eliminated but can respawn
    else if (targetPlayer.health <= 0 && targetPlayer.respawns > 0) {
      const elimType = 2;
      const ElimMessage = [elimType, targetPlayer.id];
      this.eliminations.push(ElimMessage);

      targetPlayer.respawn();
      addEntryToKillfeed(room, 2, this.id, targetPlayer.id, gunid);

      if (room.matchtype === "td") {
        updateTeamScore(room, this, 1);
      }
    }
  }



  update() {
    // HANDLE MOVEMENT
    if (!this.moving) return

    const dir = this.direction - 90;
    const vec = DIRECTION_VECTORS[dir];
    if (!vec) return;

    const speed = this.speed;

    // Use exact precalculated direction vector
    const deltaX = speed * vec.x;
    const deltaY = speed * vec.y;

    const nearbyWalls = this.room.grid.getObjectsInArea(
      this.x - hitboxXMin,
      this.x + hitboxXMax,
      this.y - hitboxYMin,
      this.y + hitboxYMax,
      "wall"
    );


    let newX = this.x + deltaX;
    let newY = this.y + deltaY;

    if (isCollisionWithCachedWalls(nearbyWalls, newX, this.y)) newX = this.x;
    if (isCollisionWithCachedWalls(nearbyWalls, this.x, newY)) newY = this.y;

    const mapWidth = this.room.mapWidth;
    const mapHeight = this.room.mapHeight;
    newX = Math.max(-mapWidth, Math.min(mapWidth, newX));
    newY = Math.max(-mapHeight, Math.min(mapHeight, newY));
    // Clean rounding — no floating drift
    this.x = newX
    this.y = newY
    //console.log(encodePosition(x) - encodePosition(player.x))

    this.room.grid.updateObject(this, this.x, this.y);
  
}

  updateView() {
    // this.ticksSinceLastChunkUpdate++
  //  if (this.ticksSinceLastChunkUpdate > 5) {
    //  this.ticksSinceLastChunkUpdate = 0;

    const centerX = this.x;
    const centerY = this.y;

    const xMin = centerX - xThreshold;
    const xMax = centerX + xThreshold;
    const yMin = centerY - yThreshold;
    const yMax = centerY + yThreshold;

    // --- 1. Get all objects in the area ---
    const nearbyObjects = this.room.grid.getObjectsInArea(
      xMin,
      xMax,
      yMin,
      yMax,
      null,
      false
    );

    const otherPlayers = [];
    const otherPlayersIds = [];
    const nearbyBullets = [];
    const staticObjects = [];
    const RealtimeObjects = [];

    for (const obj of nearbyObjects) {
      switch (obj.type) {
        case "player":
          otherPlayers.push(obj);
          otherPlayersIds.push(obj.id);

          break;

        case "bullet":
          nearbyBullets.push(obj);

          break;

        case "static_obj":
          // --- track "first-time seen" static objects ---
          if (!this.seenObjectsIds.has(obj.id)) {
            this.seenObjectsIds.add(obj.id);
            staticObjects.push([1, obj.sendx, obj.sendy]);
          }
          break;

        case "realtime_obj":
          // --- track other realtime spawns not seen in last tick ---
          if (!this.lastNearbyObjects.has(obj.id)) {
            RealtimeObjects.push([
              obj.id,
              obj.type,
              obj.x,
              obj.y,
              obj.hp,
              obj.rotation,
            ]);
          }
          break;
      }
    }

    // --- 2. Assign results back to player ---
    this.nearbyplayersids = otherPlayersIds;
    this.nearbyplayers = otherPlayers;
    this.nearbybullets = nearbyBullets;
    this.newSeenObjectsStatic = staticObjects.length
      ? staticObjects
      : undefined;
    this.newSeenRealtimeObjects = RealtimeObjects.length
      ? RealtimeObjects
      : undefined;

    const bullets = nearbyBullets;
    let finalBullets = this.bulletBuffer;
    finalBullets.length = 0; // Create a Set of previously sent bullet IDs
    const lastBulletIds = this.lastfinalbulletsSet;

    const newLastBulletIds = new Set();

    if (bullets) {
      for (const bullet of bullets.values()) {
        const alreadySent = lastBulletIds.has(bullet.id);
        if (alreadySent) {
          finalBullets.push([bullet.id]);
        } else {
          finalBullets.push([
          bullet.id,
          Math.round(bullet.position.x),
          Math.round(bullet.position.y),
          Math.round(bullet.direction),
          bullet.gunId,
          bullet.effect,
          bullet.speed,
          ]);
        }
        newLastBulletIds.add(bullet.id);
      }
    }
  

    this.finalbullets = finalBullets.length ? finalBullets : undefined;
    this.lastfinalbulletsSet = newLastBulletIds;
  }

  useGadget() {
    if (this.room && this.room.state === "playing" && this.alive) {
      const gadgetdata = gadgetconfig[this.gadgetid];
      gadgetdata.gadget(this, this.room);
    } else {
      console.error("Player not found or cannot use gadget");
    }
  }


  eliminate() {
    if (this.room.state !== "playing" || this.room.winner !== -1) return;

    if (this.room.grid) spawnAnimation(this.room, this, "eliminated");
    this.eliminated = true;
    this.alive = false;
    this.state = 3;
    this.moving = false;

    if (this.room.grid) this.room.grid.removeObject(this);

    if (this.timeout) {
      clearTimeout(this.timeout);
    }

    this.room.setRoomTimeout(() => {
      startSpectatingLogic(this, this.room);
    }, 3000);

    if (this.room.IsTeamMode) {
      // Check if the entire team is now eliminated.
      const team = this.room.teams.get(this.teamId);
      const isTeamEliminated = team.players.every((player) => {
        const p = this.room.players.get(player.id);
        return !p || p.eliminated;
      });

      if (isTeamEliminated) {
        // Find the place for the eliminated team.
        const teamPlace =
          this.room.teams.size - this.room.eliminatedTeams.length;
        team.players.forEach((player) => {
          const p = this.room.players.get(player.id);
          if (p) {
            p.place = teamPlace;
            UpdatePlayerPlace(p, teamPlace, this.room);
          }
        });
        this.room.eliminatedTeams.push({ id: team.id, place: teamPlace });
      }
    } else {
      // SOLO MODE ELIMINATION
      const eliminatedCount = [...this.room.players.values()].filter(
        (p) => p.eliminated // TODO CACHED VERSION
      ).length;
      const playerPlace = this.room.players.size - eliminatedCount + 1;
      this.place = playerPlace;
      UpdatePlayerPlace(this, playerPlace, this.room);
    }

    // Final check for a winner or end-of-game condition.
  }
  

  respawn() {
    spawnAnimation(this.room, this, "respawning");
    this.alive = false;
    this.state = 2;
    this.moving = false;
    this.last_hitter = false;
    this.room.grid.removeObject(this);

    this.respawns--;
    this.health = this.starthealth;

    if (this.UseStartRespawnPoint) {
      this.room.setRoomTimeout(() => {
        this.x = this.startspawn.x;
        this.y = this.startspawn.y;
      }, 3000);
    }

    this.room.setRoomTimeout(() => {
      this.room.grid.addObject(this);
      this.spectating = false;
      this.alive = true;
      this.state = 1;
    }, 5000);
  }
}

module.exports = {
  Player,
};
