const { gadgetconfig } = require("../config/gadgets");
const { playerhitbox } = require("../config/player");
const { PlayerRateLimiter } = require("../config/server");
const { UpdatePlayerPlace } = require("../database/ChangePlayerStats");
const { spawnAnimation } = require("../modifiers/animations");
const { addEntryToKillfeed } = require("../modifiers/killfeed");
const { isCollisionWithWalls } = require("../utils/collision");
const { createHitmarker, findNearestPlayer } = require("../utils/game");
const { DIRECTION_VECTORS } = require("../utils/movement");
const { SerializePlayerData } = require("../utils/serialize");

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
    this.top_color = top_color

    // Game state
    this.objectType = "player";
    this.position = {}
    this.width = playerhitbox.width;
    this.height = playerhitbox.height;

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
    ((this.seenObjectsIds = new Set()),
      (this.lastNearbyObjects = new Set()),
      (this.ticksSinceLastChunkUpdate = 100)); // make number high so first chunk update occurs immediately
    this.TickSinceLastNearby = 20;

    this._lastSerializedHash = 0;
    this.dirty = true;
    this.nearbyplayersidslast = [];

    this.lastfinalbulletsSet = new Set();

    this.serializeBuffer = new Array(8);
    this.bulletBuffer = [];
    this.msgBuffer = [];
    this.filteredPlayersBuffer = [];
    this.selflastmsg = {};
    this.pdHashes = {};
    this.pd = 0;
    this.spectating = false;
    this.pdHashes = {};

    this.newSeenObjectsStatic = [];
    this.nearbyanimations = [];
    this.hitmarkers = [];
    this.eliminations = [];
    this.emptySent = false;

    this.lastdata = [];

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

    // Spectating
    this.spectating = false;
    this.spectatingPlayer = userId;
    this.spectateid = 0;
    this.spectatingTarget = null;
    this.spectatingPlayerId = -1;

    // Final rewards
    ((this.finalrewards = []), (this.room = room));
    this.UseStartRespawnPoint = false;
  }

  IsEliminationAllowed() {
    let isEliminated =
      this.health <= 0 && this.respawns <= 0 && this.room.state === "playing";

    if (this.team.aliveCount > 1) isEliminated = false; // 1 on aliveCount to exclude self

    return isEliminated;
  }

  GiveAssistElimination(targetPlayer) {
    const elimType = 1;
    const ElimMessage = [elimType, targetPlayer.id];
    this.eliminations.push(ElimMessage);

    this.kills += 1;
  }

  healPlayer(healthToAdd, source) {
    const lastHealth = this.health;
    const maxHealthLimit = this.starthealth;

    this.health = Math.min(this.health + healthToAdd, maxHealthLimit);
    this.last_healing_time = Date.now();

    //   createHitmarker(this, this, damage);
    if (this.health !== lastHealth) this.dirty = true;
  }

  damagePlayer(damage) {
    const lastHealth = this.health;

    this.health -= damage;
    this.last_damaged_time = Date.now();

    //   createHitmarker(this, this, damage);
     if (this.health !== lastHealth) this.dirty = true;

    if (this.health > 0) return;

    // now we know that player has no health left


    if (this.IsEliminationAllowed()) {
      this.eliminate();
    } else if (this.respawns > 0 || this.team.aliveCount > 1) {
      this.respawn();
    }
  }

  HandleSelfBulletsOtherPlayerCollision(targetPlayer, damage, gunid, room) {
    const GUN_BULLET_DAMAGE = Math.min(damage, targetPlayer.health);

    targetPlayer.health -= GUN_BULLET_DAMAGE;
    targetPlayer.dirty = true;
    this.damage += GUN_BULLET_DAMAGE;
    targetPlayer.last_damaged_time = Date.now();
    targetPlayer.last_hitter = this; // Track who last hit the player

    createHitmarker(targetPlayer, this, GUN_BULLET_DAMAGE);

    if (targetPlayer.health > 0) return;

    // now we know that player has no health left

    // ✅ Player completely eliminated (no respawns left, last one on team)
    if (targetPlayer.IsEliminationAllowed()) {
      const elimType = 1;
      const ElimMessage = [elimType, targetPlayer.id];
      this.eliminations.push(ElimMessage);

      targetPlayer.eliminator = this.id;
      targetPlayer.spectatingTarget = this;
      targetPlayer.eliminate();

      this.kills += 1;
      room.allplayerkillscount += 1;
    }

    // ✅ Player eliminated but can respawn
    else if (targetPlayer.respawns > 0 || targetPlayer.team.aliveCount > 1) {
      const elimType = 2;
      const ElimMessage = [elimType, targetPlayer.id];
      this.eliminations.push(ElimMessage);

      targetPlayer.respawn();
    }
  }

  update() {
    // HANDLE MOVEMENT
    if (!this.moving) return;

    const { x: lastX, y: lastY } = this.position

    const dir = this.direction - 90;
    const vec = DIRECTION_VECTORS[dir];
    if (!vec) return;

    const speed = this.speed;

    // Use exact precalculated direction vector
    const dx = speed * vec.x;
    const dy = speed * vec.y;

    const { x, y } = this.position;

    const nearbyWalls = this.room.grid.getObjectsInArea(
      x - hitboxXMin,
      x + hitboxXMax,
      y - hitboxYMin,
      y + hitboxYMax,
      "wall",
    );

    let newX = x + dx;
    let newY = y + dy;

    if (isCollisionWithWalls(nearbyWalls, newX, y)) newX = x;
    if (isCollisionWithWalls(nearbyWalls, x, newY)) newY = y;

      const { mapWidth, mapHeight } = this.room;
  newX = Math.max(-mapWidth, Math.min(mapWidth, newX));
  newY = Math.max(-mapHeight, Math.min(mapHeight, newY));


   this.position.x = newX;
   this.position.y = newY;

  // change detection (numeric, deterministic)
  if (newX !== lastX || newY !== lastY) {
    this.room.grid.updateObject(this, this.position);
    this.dirty = true;
  }
}

  updateView() {
    this.ticksSinceLastChunkUpdate++;
    const shouldUpdateChunks = this.ticksSinceLastChunkUpdate > 4;
    // this.ticksSinceLastChunkUpdate++
    //  if (this.ticksSinceLastChunkUpdate > 5) {
    //  this.ticksSinceLastChunkUpdate = 0;
    const positionSource = this.spectatingTarget ? this.spectatingTarget : this;
    const centerX = positionSource.position.x;
    const centerY = positionSource.position.y;

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
    );

    const otherPlayers = [];
    const otherPlayersIds = [];
    const nearbyBullets = [];
    const staticObjects = [];
    const RealtimeObjects = [];

    for (const obj of nearbyObjects) {
      switch (obj.objectType) {
        case "player":
          otherPlayers.push(obj);
          otherPlayersIds.push(obj.id);

          break;

        case "bullet":
          nearbyBullets.push(obj);

          break;
      }
    }

    if (shouldUpdateChunks) {
      this.ticksSinceLastChunkUpdate = 0;

      for (const obj of nearbyObjects) {
        switch (obj.objectType) {
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
                obj.objectType,
                obj.position.x,
                obj.position.y,
                obj.hp,
                obj.rotation,
              ]);
            }

            break;
        }
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
            bullet.client_render_speed,
            bullet.directionChange ? Object.values(bullet.directionChange) : undefined

            /// (GlobalRoomConfig.room_tick_rate_ms / GlobalRoomConfig.bullet_updates_per_tick),
          ]);

        //  console.log( bullet.directionChange ? [Object.values(bullet.directionChange)] : undefined)
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

    addEntryToKillfeed({
      room: this.room,
      type: 1,
      target: this.id,
    });

    this.dirty = false;

    if (this.alive) spawnAnimation(this.room, this, "eliminated"); // this is if one team member is not alive but other team members are to avoid that a team member gets an animation who is not alive
    this.eliminated = true;
    this.alive = false;
    this.state = 3;
    this.moving = false;
    this.team.aliveCount--;

    this.room.grid.removeObject(this);
    this.room.alivePlayers.delete(this);

    this.startSpectating();

    if (this.room.IsTeamMode && this.team.aliveCount === 0) {
      // Find the place for the eliminated team.
      if (this.team.eliminated) return;
      this.team.eliminated = true;
      const teamPlace = this.room.aliveTeams;
      this.room.aliveTeams--;
      for (const player of this.team.players) {
        if (player) {
          player.place = teamPlace;

          if (!player.eliminated) player.eliminate();
          UpdatePlayerPlace(player, teamPlace, this.room);
        }
      }
      this.room.lastEliminatedTeam = this.team;
      this.room.eliminatedTeams.push({ id: team.id, place: teamPlace });
    } else {
      const playerPlace = this.room.alivePlayers.size + 1;
      this.place = playerPlace;
      this.room.lastEliminatedPlayer = this;
      UpdatePlayerPlace(this, playerPlace, this.room);
    }

  }




  respawn() {
    addEntryToKillfeed({
      room: this.room,
      type: 1,
      target: this.id,
    });

    this.dirty = false;

    spawnAnimation(this.room, this, "respawning");
    this.alive = false;
    this.state = 2;
    this.moving = false;
    this.team.aliveCount--;

    this.room.grid.removeObject(this);
    this.room.alivePlayers.delete(this);

    this.last_hitter = false;

    this.respawns--;
    this.health = this.starthealth;

    this.room.setRoomTimeout(() => {
      if (this.room.IsTeamMode && 1 > this.team.aliveCount)
        if (this.eliminated) return;

      if (this.team.aliveCount > 0) {
        let aliveTeamPlayer = false;
        for (const teamplayer of this.team.players) {
          if (teamplayer.alive) {
            this.position.x = teamplayer.position.x;
            this.position.y = teamplayer.position.y
            continue;
          }
        }
      }
      this.room.grid.addObject(this);
      this.room.alivePlayers.add(this);
      this.spectating = false;
      this.alive = true;
      this.team.aliveCount++;
      this.state = 1;
      this.room.playerDataBuffer.set(this.id, SerializePlayerData(this));
      this.dirty = true;

      addEntryToKillfeed({
        room: this.room,
        type: 2,
        target: this.id,
      });
    }, 5000);
  }





  startSpectating(initialTarget = null) {
    this.spectating = true;
    this.pendingSwitchAt = null;
    this.lastSpectateSwitch = null;

    if (initialTarget && !initialTarget.eliminated) {
      this.spectatingTarget = target;
      this.spectatingPlayerId = target.id;
    } else {
      this.spectatingTarget = null;
      this.spectatingPlayerId = null;
    }
  }

  updateSpectatorMode() {
    const now = Date.now();

    // If revived → stop spectating immediately
    if (this.alive) {
      this.spectating = false;
      this.spectatingTarget = null;
      this.spectatingPlayerId = null;
      this.pendingSwitchAt = null;
      this.lastSpectateSwitch = null;
      return;
    }

    this.spectating = true;

    const currentTarget = this.spectatingTarget;

    // Follow current target if valid
    if (currentTarget && !currentTarget.eliminated) {
      this.spectatingTarget = currentTarget;
      this.spectatingPlayerId = currentTarget.id;
      return;
    }

    // If target died, start countdown (once)
    if (!this.pendingSwitchAt) {
      this.pendingSwitchAt = now + 1000;
      return;
    }

    // Wait full 2 seconds
    if (now < this.pendingSwitchAt) {
      return;
    }

    // Time to switch
    const nearest = findNearestPlayer(this, this.room.alivePlayers);

    if (nearest && !nearest.eliminated) {
      this.spectatingTarget = nearest;
      this.spectatingPlayerId = nearest.id;
      this.lastSpectateSwitch = now;
    } else {
      // No valid players left
      this.spectatingTarget = null;
      this.spectatingPlayerId = null;
    }

    this.pendingSwitchAt = null;
  }
}

module.exports = {
  Player,
};
