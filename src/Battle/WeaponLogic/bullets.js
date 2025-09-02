"use strict";

function PlaceNewObject(room, obj) {
 
 room.notSeenObjectgrid.addObject(obj);

}

const { gunsconfig } = require("@main/modules");
const { isCollisionWithBullet, findCollidedWall, adjustBulletDirection, isCollisionWithPlayer } = require("../Collisions/collision");
const { handleDummyCollision, handlePlayerCollision } = require("../PlayerLogic/movement");

class Vec2 {
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }

  static fromAngle(degrees) {
    const rad = degrees * (Math.PI / 180);
    return new Vec2(Math.cos(rad), Math.sin(rad));
  }

  add(vec) {
    return new Vec2(this.x + vec.x, this.y + vec.y);
  }

  scale(scalar) {
    return new Vec2(this.x * scalar, this.y * scalar);
  }

  distanceTo(vec) {
    const dx = this.x - vec.x;
    const dy = this.y - vec.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
}

// ---------- Bullet Class ----------
class Bullet {
  constructor({
    id,
    position,
    direction, // degrees
    speed,
    height,
    width,
    maxTime,
    maxDistance,
    damage,
    damageConfig,
    gunId,
    modifiers,
    ownerId,
  }) {
    this.id = id;
    this.position = position; // Vec2
    this.direction = direction;
    this.speed = speed;
    this.height = height;
    this.width = width;
    this.maxTime = maxTime;
    this.maxDistance = maxDistance;
    this.damage = damage;
    this.damageConfig = damageConfig;
    this.gunId = Number(gunId);
    this.modifiers = modifiers;
    this.ownerId = ownerId;
    this.startPosition = position;
    this.spawnTime = Date.now();
    this.alive = true;
    this.new = true
    this.effect = 1; // firing effect at spawn
  }

  nextPosition() {
    // Move bullet along direction by speed units per tick
    const dirVec = Vec2.fromAngle(this.direction - 90);
    return this.position.add(dirVec.scale(this.speed));
  }

  isExpired() {
    if (!this.alive) return true;
    if (Date.now() > this.maxTime) return true;
    if (this.position.distanceTo(this.startPosition) > this.maxDistance) return true;
    return false;
  }

  kill() {
    this.alive = false;
  }
}

// ---------- Bullet Manager ----------
class BulletManager {
  constructor(room) {
    this.room = room;
    this.bullets = room.bullets // id => Bullet
    this.scheduledBullets = [];
    this.nextBulletId = 1;
  }

  generateBulletId() {
   const id = this.nextBulletId;
    this.nextBulletId += 1;
    // wrap around if very large
    if (this.nextBulletId > 655) this.nextBulletId = 1; 
    return id;
}

    spawnBullet(player, bulletData) {

      const obj = { x: player.x, y: player.y, type: "spray" }
      PlaceNewObject(this.room, obj)


    const id = this.generateBulletId();
    const angle = bulletData.angle;
    const offset = bulletData.offset;

    const baseDirVec = Vec2.fromAngle(angle);
    const perpDirVec = Vec2.fromAngle(angle - 90);

    const initialPosition = new Vec2(player.x, player.y)
      .add(baseDirVec.scale(offset))
      .add(perpDirVec.scale(30));

    const bullet = new Bullet({
      id,
      position: initialPosition,
      direction: angle,
      speed: bulletData.speed / 2,
      height: bulletData.height,
      width: bulletData.width,
      maxTime: bulletData.maxtime,
      maxDistance: bulletData.distance,
      damage: bulletData.damage,
      damageConfig: bulletData.damageconfig || [],
      gunId: bulletData.gunid,
      modifiers: bulletData.modifiers,
      ownerId: player.playerId,
    });

    this.bullets.set(id, bullet); 
    this.room.bulletgrid.addObject(bullet);

    return bullet;
  }


  update() {
  // collect deletions to avoid mutating the Map while iterating
   this.processScheduledBullets();
  const toRemove = []; // array of [playerId, bulletId]


    for (const [id, bullet] of this.bullets.entries()) {
      if (!bullet || !bullet.alive || bullet.isExpired()) {
        toRemove.push(id);
        continue;
      }

    

      const nextPos = bullet.nextPosition();
   
       this.room.bulletgrid.updateObject(bullet, nextPos.x, nextPos.y);

      let newEffect = 0
     
      // Collision with walls
      if (isCollisionWithBullet(this.room.grid, nextPos.x, nextPos.y, bullet.height, bullet.width, bullet.direction - 90)) {
        const collidedWall = findCollidedWall(this.room.grid, nextPos.x, nextPos.y, bullet.height, bullet.width, bullet.direction - 90);
        if (collidedWall) {
          if (GunHasModifier("DestroyWalls", this.room, bullet.modifiers)) {
            DestroyWall(collidedWall, this.room);
            newEffect = 3
          }
          if (GunHasModifier("DestroyWalls(DestroyBullet)", this.room, bullet.modifiers)) {
            toRemove.push(id);
            DestroyWall(collidedWall, this.room);
            newEffect = 3
            continue;
          }
          if (GunHasModifier("CanBounce", this.room, bullet.modifiers)) {
            adjustBulletDirection(bullet, collidedWall, -90);
             newEffect = 2
            continue; // Don't move bullet position this tick
          }
          toRemove.push(id);
          continue;
        }
      }
    
      // Collision with players
      if (this.room.config && this.room.winner === -1) {
        let hitSomething = false;

        const centerX = bullet.position.x
        const centerY = bullet.position.y
        const threshold = bullet.width > bullet.height ? bullet.width : bullet.height
        const xThreshold = threshold
        const yThreshold = threshold
        
        const nearbyPlayers = this.room.realtimegrid.getObjectsInArea(
        centerX - xThreshold,
        centerX + xThreshold,
        centerY - yThreshold,
        centerY + yThreshold,
        );

        for (const otherPlayer of nearbyPlayers) {
          if (otherPlayer.playerId !== bullet.ownerId && otherPlayer.alive && !this.isAlly(bullet.ownerId, otherPlayer)) {
            if (isCollisionWithPlayer({x: bullet.position.x, y: bullet.position.y }, otherPlayer, bullet.height, bullet.width, bullet.direction - 90)) {
              const distTraveled = bullet.position.distanceTo(bullet.startPosition);
              const finalDamage = calculateFinalDamage(distTraveled, bullet.maxDistance, bullet.damage, bullet.damageConfig);
              handlePlayerCollision(this.room, this.room.players.get(bullet.ownerId), otherPlayer, finalDamage, bullet.gunId);

              this.room.activeAfflictions.push({
                shootingPlayer: this.room.players.get(bullet.ownerId),
                target: otherPlayer,
                target_type: "player",
                damage: 1,
                speed: 500, // interval between hits in ms
                gunid: bullet.gunId,
                nextTick: Date.now() + 500, // first tick time
                expires: Date.now() + 3000, // when this effect ends
              });

              toRemove.push(id);
              hitSomething = true;
              break;
            }
          }
        }
        if (hitSomething) continue;
      }

      // Collision with dummies
      if (this.room.config.canCollideWithDummies && this.room.winner === -1) {
        let hitDummy = false;
        for (const dummyKey in this.room.dummies) {
          const dummy = this.room.dummies[dummyKey];
          if (isCollisionWithPlayer({x: bullet.position.x, y: bullet.position.y }, dummy, bullet.height, bullet.width, bullet.direction - 90)) {
            const distTraveled = bullet.position.distanceTo(bullet.startPosition);
            const finalDamage = calculateFinalDamage(distTraveled, bullet.maxDistance, bullet.damage, bullet.damageConfig);
            handleDummyCollision(this.room, this.room.players.get(bullet.ownerId), dummyKey, finalDamage);

              this.room.activeAfflictions.push({
                shootingPlayer: this.room.players.get(bullet.ownerId),
                 dummykey: dummyKey,
                target_type: "dummy",
                damage: 1,
                speed: 500, // interval between hits in ms
                gunid: bullet.gunId,
                nextTick: Date.now() + 500, // first tick time
                expires: Date.now() + 3000, // when this effect ends
              });

            toRemove.push(id);
            hitDummy = true;
            break;
          }
        }
       if (hitDummy) continue;
      }

     bullet.position = nextPos;

    if (bullet.new) bullet.effect = 1;          // just fired
    else if (bullet.effect) bullet.effect = newEffect; // collision/bounce
    else bullet.effect = 0;                     // nothing special this tick

    bullet.new = false;
  }


   for (const id of toRemove) {
      this.killBullet(id);
    }
  }


   killBullet(bulletId) {
    const bullet = this.bullets.get(bulletId);
    if (!bullet) return;

    this.room.bulletgrid.removeObject(bullet); 
    bullet.kill();
    this.bullets.delete(bulletId);
  }

  isAlly(ownerId, otherPlayer) {
    const owner = this.room.players.get(ownerId);
    const other = otherPlayer;

    // If either player doesn't exist, they can't be allies.
    if (!owner || !other) {
        return false;
    }

    // A player is not their own ally unless the game mode is solo.
    if (owner.id === other.id) {
        return false;
    }

    // If the game is not in team mode, there are no allies.
    if (!this.room.IsTeamMode) {
        return false;
    }

    // In team mode, players are allies if they have the same teamId.
    return owner.teamId === other.teamId;
}

  processScheduledBullets() {
  const now = Date.now();

  for (let i = this.scheduledBullets.length - 1; i >= 0; i--) {
    const scheduled = this.scheduledBullets[i];
    if (now >= scheduled.spawnTime) {
      const player = this.room.players.get(scheduled.playerId);
      if (player) {
        this.spawnBullet(player, scheduled.bulletData);
      }
      this.scheduledBullets.splice(i, 1);
    }
  }
}


   scheduleBullet(player, bulletData, delayMs) {
    const spawnTime = Date.now() + delayMs;
    this.scheduledBullets.push({ spawnTime, playerId: player.playerId, bulletData });
  }
}


// ---------- Helper Functions (stub these with your existing implementations) ----------

function GunHasModifier(name, room, modifiers) {
  return modifiers.has(name) || room.weapons_modifiers_override.has(name);
}

function DestroyWall(wall, room) {
  room.grid.removeObject(wall);
  room.destroyedWalls.push([wall.x,wall.y]);
}

function calculateFinalDamage(distanceUsed, bulletMaxDistance, normalDamage, layers) {
  if (!Array.isArray(layers) || layers.length === 0) return normalDamage;
  for (const layer of layers) {
    const thresholdDistance = (layer.threshold / 100) * bulletMaxDistance;
    if (distanceUsed <= thresholdDistance) return Math.ceil(normalDamage * layer.damageMultiplier);
  }
  return 0;
}

function handleBulletFired(room, player, gunType) {
  const gun = gunsconfig[gunType];
  const currentTime = Date.now();

  // Prevent shooting if player is already shooting or cooldown not passed
  if (player.shooting || (currentTime - (player.lastShootTime || 0) < gun.cooldown)) {
    return;
  }

  player.shooting = true;
  player.lastShootTime = currentTime;

  // Base angle
  const baseAngle = gun.useplayerangle ? player.shoot_direction : 0;

  // For each bullet config, fire respecting its own delay


   for (const bulletConfig of gun.bullets) {
  room.bulletManager.scheduleBullet(player, {
    speed: bulletConfig.speed,
    offset: bulletConfig.offset,
    damage: gun.damage,
    angle: gun.useplayerangle ? bulletConfig.angle + baseAngle : bulletConfig.angle,
    height: gun.height / 2.5,
    width: gun.width / 2.5,
    maxtime: Date.now() + gun.maxexistingtime + bulletConfig.delay,
    distance: gun.distance,
    damageconfig: gun.damageconfig || [],
    gunid: gunType,
    modifiers: gun.modifiers,
    spinning_speed: gun.spinning_speed || undefined,
  }, bulletConfig.delay);
}

  // Reset shooting state after cooldown
  room.timeoutIds.push(setTimeout(() => {
    player.shooting = false;
  }, gun.cooldown));
}



module.exports = {
  BulletManager,
  handleBulletFired
};