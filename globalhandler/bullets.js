"use strict";

const { isCollisionWithBullet, adjustBulletDirection, findCollidedWall, isCollisionWithPlayer } = require('./collisions');
const { handlePlayerCollision, handleDummyCollision } = require('./player');
const { gunsconfig } = require('./config');
const { AddAffliction } = require('./bullets-effects')


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
    this.gunId = gunId;
    this.modifiers = modifiers;
    this.ownerId = ownerId;
    this.startPosition = position;
    this.spawnTime = Date.now();
    this.alive = true;
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
    this.bullets = new Map(); // id => Bullet
    this.scheduledBullets = [];
  }

  generateBulletId() {
    return Math.random().toString(36).substring(2, 7);
  }

    spawnBullet(player, bulletData) {
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

    if (!this.bullets.has(player.playerId)) {
      this.bullets.set(player.playerId, new Map());
    }

      this.bullets.get(player.playerId).set(id, bullet);
   // this.room.bulletsUpdates.push(this.formatBulletSpawnMsg(bullet));

    return bullet;
  }

  formatBulletSpawnMsg(bullet) {
    return `${bullet.id}:${bullet.position.x.toFixed(4)}:${bullet.position.y.toFixed(4)}:${bullet.direction}:${bullet.speed}:${bullet.gunId}`;
  }

  update() {
  // collect deletions to avoid mutating the Map while iterating
   this.processScheduledBullets();
  const toRemove = []; // array of [playerId, bulletId]

  for (const [playerId, playerBullets] of this.bullets.entries()) {
    // if playerBullets is not a Map (defensive), skip
    if (!(playerBullets instanceof Map)) continue;

    for (const [id, bullet] of playerBullets.entries()) {
      // skip if bullet was already killed earlier
      if (!bullet || !bullet.alive) {
        toRemove.push([playerId, id]);
        continue;
      }

      if (bullet.isExpired()) {
        toRemove.push([playerId, id]);
        continue;
      }

      const nextPos = bullet.nextPosition();
       bullet.position = nextPos;

      // Collision with walls
      if (isCollisionWithBullet(this.room.grid, nextPos.x, nextPos.y, bullet.height, bullet.width, bullet.direction - 90)) {
        const collidedWall = findCollidedWall(this.room.grid, nextPos.x, nextPos.y, bullet.height, bullet.width);
        if (collidedWall) {
          if (GunHasModifier("DestroyWalls", this.room, bullet.modifiers)) {
            DestroyWall(collidedWall, this.room);
          }
          if (GunHasModifier("DestroyWalls(DestroyBullet)", this.room, bullet.modifiers)) {
            toRemove.push([playerId, id]);
            DestroyWall(collidedWall, this.room);
            continue;
          }
          if (GunHasModifier("CanBounce", this.room, bullet.modifiers)) {
            adjustBulletDirection(bullet, collidedWall, 50);
            continue; // Don't move bullet position this tick
          }
          toRemove.push([playerId, id]);
          continue;
        }
      }

      // Collision with players
      if (this.room.config.canCollideWithPlayers && this.room.winner === -1) {
        let hitSomething = false;
        for (const otherPlayer of this.room.players.values()) {
          if (otherPlayer.playerId !== bullet.ownerId && otherPlayer.visible && !this.isAlly(bullet.ownerId, otherPlayer)) {
            if (isCollisionWithPlayer(bullet, otherPlayer, bullet.height, bullet.width, bullet.direction - 90)) {
              const distTraveled = bullet.position.distanceTo(bullet.startPosition);
              const finalDamage = calculateFinalDamage(distTraveled, bullet.maxDistance, bullet.damage, bullet.damageConfig);
              handlePlayerCollision(this.room, this.room.players.get(bullet.ownerId), otherPlayer, finalDamage, bullet.gunId);

              AddAffliction(this.room, this.room.players.get(bullet.ownerId), otherPlayer, {
                target_type: "player",
                damage: 1,
                speed: 500,
                duration: 3000,
                gunid: bullet.gunId,
              });

              toRemove.push([playerId, id]);
              hitSomething = true;
              break;
            }
          }
        }
        if (hitSomething) continue;
      }

      // Collision with dummies
      if (this.room.config.canCollideWithDummies) {
        let hitDummy = false;
        for (const dummyKey in this.room.dummies) {
          const dummy = this.room.dummies[dummyKey];
          if (isCollisionWithPlayer(bullet, dummy, bullet.height, bullet.width, bullet.direction - 90)) {
            const distTraveled = bullet.position.distanceTo(bullet.startPosition);
            const finalDamage = calculateFinalDamage(distTraveled, bullet.maxDistance, bullet.damage, bullet.damageConfig);
            handleDummyCollision(this.room, this.room.players.get(bullet.ownerId), dummyKey, finalDamage);

            AddAffliction(this.room, this.room.players.get(bullet.ownerId), dummy, {
              target_type: "dummy",
              damage: 1,
              speed: 500,
              duration: 3000,
              gunid: bullet.gunId,
              dummykey: dummyKey,
            });

            toRemove.push([playerId, id]);
            hitDummy = true;
            break;
          }
        }
        if (hitDummy) continue;
      }

      // Move bullet forward if still alive
      if (bullet.alive) {
       
      }
    }
  }

  // perform deletions AFTER iterating
  for (const [playerId, bulletId] of toRemove) {
    this.killBullet(playerId, bulletId);
  }
}

  killBullet(playerId, bulletId) {
  const playerBullets = this.bullets.get(playerId);
  if (!playerBullets) return;

  const bullet = playerBullets.get(bulletId);
  if (!bullet) return;

  bullet.kill();
  playerBullets.delete(bulletId);
  this.room.bulletsUpdates.push(`DEL:${bulletId}`);

  // If no bullets left for player, clean up empty map (FIXED reference)
  if (playerBullets.size === 0) {
    this.bullets.delete(playerId); // <-- was this.player.bullets.delete(playerId) (bug)
  }
}

  isAlly(ownerId, otherPlayer) {
    const owner = this.room.players.get(ownerId);
    if (!owner) return false;
    return owner.team.players.some(p => p.nmb === otherPlayer.nmb);
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

// In your main update loop (BulletManager.update or Room.update)
  }

// ---------- Helper Functions (stub these with your existing implementations) ----------

function GunHasModifier(name, room, modifiers) {
  return modifiers.has(name) || room.weapons_modifiers_override.has(name);
}

function DestroyWall(wall, room) {
  room.grid.removeObject(wall);
  room.destroyedWalls.push(`${wall.x}:${wall.y}`);
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
  const gun = gunsconfig.get(gunType);
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