"use strict";

const { gunsconfig } = require("../config/guns");
const { playerhitbox } = require("../config/player");
const { AddNewUnseenObject, isPositionOutsideMapBounds } = require("../utils/game");

const playerWidth = playerhitbox.width;
const playerHeight = playerhitbox.height;

const BULLET_TICK_RATE = 40; // 5Hz server bullet tick
const BULLET_TICK_MS = 1000 / BULLET_TICK_RATE;

/* =========================
   CCD (Model A)
========================= */

// Swept rectangle vs AABB (Minkowski sum + slab test)
function sweptRectAABB(segStart, segEnd, boxCenter, boxW, boxH, rectW, rectH) {
  const minX = boxCenter.x - boxW / 2 - rectW / 2;
  const maxX = boxCenter.x + boxW / 2 + rectW / 2;
  const minY = boxCenter.y - boxH / 2 - rectH / 2;
  const maxY = boxCenter.y + boxH / 2 + rectH / 2;

  const dx = segEnd.x - segStart.x;
  const dy = segEnd.y - segStart.y;

  let tMin = 0;
  let tMax = 1;

  // X slab
  if (dx !== 0) {
    const tx1 = (minX - segStart.x) / dx;
    const tx2 = (maxX - segStart.x) / dx;
    tMin = Math.max(tMin, Math.min(tx1, tx2));
    tMax = Math.min(tMax, Math.max(tx1, tx2));
  } else if (segStart.x < minX || segStart.x > maxX) {
    return false;
  }

  // Y slab
  if (dy !== 0) {
    const ty1 = (minY - segStart.y) / dy;
    const ty2 = (maxY - segStart.y) / dy;
    tMin = Math.max(tMin, Math.min(ty1, ty2));
    tMax = Math.min(tMax, Math.max(ty1, ty2));
  } else if (segStart.y < minY || segStart.y > maxY) {
    return false;
  }

  return tMax >= tMin && tMin <= 1 && tMax >= 0;
}

/* =========================
   VECTOR
========================= */
class Vec2 {
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }

  static fromAngle(deg) {
    const rad = deg * (Math.PI / 180);
    return new Vec2(Math.cos(rad), Math.sin(rad));
  }

  add(v) {
    return new Vec2(this.x + v.x, this.y + v.y);
  }

  scale(s) {
    return new Vec2(this.x * s, this.y * s);
  }

  static distanceSquared(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
  }
}

/* =========================
   BULLET
========================= */
class Bullet {
  constructor(data) {
    Object.assign(this, data);
    this.dirVec = Vec2.fromAngle(this.direction - 90);
    this.prevPosition = this.position;
    this.spawnTime = Date.now();
    this.alive = true;
    this.updatesTick = 1000
  }

  nextPosition() {
    return this.position.add(this.dirVec.scale(this.speed));
  }

  kill() {
    this.alive = false;
  }

  isExpired() {
    if (!this.alive) return true;
    if (Date.now() > this.maxTime) return true;
    return false;
  }
}

/* =========================
   BULLET MANAGER
========================= */
class BulletManager {
  constructor(room) {
    this.room = room;
    this.bullets = room.bullets;
    this.scheduledBullets = [];
    this.nextBulletId = 1;
  }

    // Central bullet tick loop

  generateBulletId() {
    const id = this.nextBulletId++;
    if (this.nextBulletId > 65535) this.nextBulletId = 1;
    return id;
  }

  spawnBullet(player, bulletData) {
    const id = this.generateBulletId();
    const angle = bulletData.angle;
    const offset = bulletData.offset;

    const baseDir = Vec2.fromAngle(angle);
    const perpDir = Vec2.fromAngle(angle - 90);

    const initialPosition = new Vec2(player.x, player.y)
      .add(baseDir.scale(offset))
      .add(perpDir.scale(30));

    const bullet = new Bullet({
      id,
      position: initialPosition,
      startPosition: initialPosition,
      direction: angle,
      speed: bulletData.speed,
      height: bulletData.height,
      width: bulletData.width,
      maxTime: bulletData.maxtime,
      maxDistance: bulletData.distance,
      damage: bulletData.damage,
      damageConfig: bulletData.damageconfig || [],
      afflictionConfig: bulletData.afflictionConfig || false,
      gunId: bulletData.gunid,
      modifiers: bulletData.modifiers,
      owner: player,
      x: initialPosition.x,
      y: initialPosition.y,
      objectType: "bullet",
      updatesTick: 1000,
    });

    this.bullets.set(id, bullet);
    this.room.grid.addObject(bullet);
    return bullet;
  }

  update() {
    this.processScheduledBullets();
    const toRemove = [];

    for (const [id, bullet] of this.bullets.entries()) {
      if (!bullet || !bullet.alive || bullet.isExpired()) {
        toRemove.push(id);
        continue;
      }

     // bullet.updatesTick++

     // if (bullet.updatesTick > 1) {
     // bullet.updatesTick = 0
      console.log(Date.now())

      const prevPos = bullet.position;
      const nextPos = bullet.nextPosition();

      bullet.prevPosition = prevPos;
      bullet.position = nextPos;
      bullet.x = prevPos.x;
      bullet.y = prevPos.y;

      if (isPositionOutsideMapBounds(this.room, nextPos.x, nextPos.y)) {
        toRemove.push(id);
        continue;
      }

      /* ==== WALLS ==== */
      const nearbyWalls = this.room.grid.getObjectsInArea(
        Math.min(prevPos.x, nextPos.x) - 80,
        Math.max(prevPos.x, nextPos.x) + 80,
        Math.min(prevPos.y, nextPos.y) - 80,
        Math.max(prevPos.y, nextPos.y) + 80,
        "wall"
      );

      for (const wall of nearbyWalls) {
        const hit = sweptRectAABB(
          prevPos,
          nextPos,
          { x: wall.x, y: wall.y },
          wall.width,
          wall.height,
          bullet.width,
          bullet.height
        );

        if (hit) {
          if (GunHasModifier("DestroyWalls", this.room, bullet.modifiers)) {
            DestroyWall(wall, this.room);
          }
          toRemove.push(id);
          break;
        }
      }

      /* ==== PLAYERS ==== */
      const nearbyPlayers = this.room.grid.getObjectsInArea(
        Math.min(prevPos.x, nextPos.x) - 80,
        Math.max(prevPos.x, nextPos.x) + 80,
        Math.min(prevPos.y, nextPos.y) - 80,
        Math.max(prevPos.y, nextPos.y) + 80,
        "player"
      );

      for (const obj of nearbyPlayers) {
        if (!obj.alive || obj === bullet.owner || this.isAlly(bullet.owner, obj))
          continue;

        const hit = sweptRectAABB(
          prevPos,
          nextPos,
          { x: obj.x, y: obj.y },
          playerWidth,
          playerHeight,
          bullet.width,
          bullet.height
        );

        if (hit) {
          const finalDamage = bullet.damageConfig.length
            ? calculateFinalDamage(
                Vec2.distanceSquared(bullet.startPosition, bullet.position),
                bullet.maxDistance,
                bullet.damage,
                bullet.damageConfig
              )
            : bullet.damage;

          bullet.owner.HandleSelfBulletsOtherPlayerCollision(
            obj,
            finalDamage,
            bullet.gunId,
            this.room
          );

          if (bullet.afflictionConfig) {
            const a = bullet.afflictionConfig;
            this.room.activeAfflictions.push({
              shootingPlayer: bullet.owner,
              target: obj,
              target_type: "player",
              damage: a.damage,
              speed: a.waitTime,
              gunid: bullet.gunId,
              nextTick: Date.now() + a.waitTime,
              expires: Date.now() + a.activeTime,
            });
          }

          toRemove.push(id);
          break;
    //    }
      }
    }
  }

    for (const id of toRemove) this.killBullet(id);
  }

  killBullet(bulletId) {
    const bullet = this.bullets.get(bulletId);
    if (!bullet) return;
    this.room.grid.removeObject(bullet);
    bullet.kill();
    this.bullets.delete(bulletId);
  }

  isAlly(owner, other) {
    if (!owner || !other) return false;
    if (owner.id === other.id) return false;
    if (!this.room.IsTeamMode) return false;
    return owner.team.id === other.team.id;
  }

  processScheduledBullets() {
    const now = Date.now();
    for (let i = this.scheduledBullets.length - 1; i >= 0; i--) {
      const s = this.scheduledBullets[i];
      if (now >= s.spawnTime) {
        if (s.owner) this.spawnBullet(s.owner, s.bulletData);
        this.scheduledBullets.splice(i, 1);
      }
    }
  }

  scheduleBullet(player, bulletData, delayMs) {
    this.scheduledBullets.push({
      spawnTime: Date.now() + delayMs,
      owner: player,
      bulletData,
    });
  }
}

/* =========================
   HELPERS
========================= */

function GunHasModifier(name, room, modifiers) {
  return modifiers.has(name) || room.weapons_modifiers_override.has(name);
}

function DestroyWall(wall, room) {
  room.grid.removeObject(wall);
  AddNewUnseenObject(room, {
    objectType: "static_obj",
    id: wall.gid,
    x: wall.x,
    y: wall.y,
    sendx: wall.x,
    sendy: wall.y,
  });
}

function calculateFinalDamage(distanceSquaredUsed, bulletMaxDistance, normalDamage, layers) {
  if (!layers.length) return normalDamage;
  const maxDistSq = bulletMaxDistance * bulletMaxDistance;

  for (const layer of layers) {
    const thresholdDistanceSq = (layer.threshold / 100) * maxDistSq;
    if (distanceSquaredUsed <= thresholdDistanceSq)
      return Math.ceil(normalDamage * layer.damageMultiplier);
  }
  return 0;
}

/* =========================
   FIRE HANDLER
========================= */

function handleBulletFired(room, player, gunType) {
  const gun = gunsconfig[gunType];
  const now = Date.now();

  if (player.shooting || now - (player.lastShootTime || 0) < gun.cooldown) return;

  player.shooting = true;
  player.lastShootTime = now;

  const baseAngle = gun.useplayerangle ? player.shoot_direction : 0;

  for (const bulletConfig of gun.bullets) {
    room.bulletManager.scheduleBullet(
      player,
      {
        speed: Math.round(bulletConfig.speed),
        offset: bulletConfig.offset,
        damage: gun.damage,
        angle: gun.useplayerangle
          ? bulletConfig.angle + baseAngle
          : bulletConfig.angle,
        height: gun.height / 3,
        width: gun.width / 3,
        maxtime: Date.now() + gun.maxexistingtime + bulletConfig.delay,
        distance: gun.distance,
        damageconfig: gun.damageconfig || [],
        afflictionConfig: gun.afflictionConfig || false,
        gunid: gunType,
        modifiers: gun.modifiers,
      },
      bulletConfig.delay
    );
  }

  room.setRoomTimeout(() => {
    player.shooting = false;
  }, gun.cooldown);
}

module.exports = {
  BulletManager,
  handleBulletFired,
  Vec2,
  BULLET_TICK_RATE,
};
