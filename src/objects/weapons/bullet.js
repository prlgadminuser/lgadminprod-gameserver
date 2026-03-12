"use strict";

const { gunsconfig } = require("../../config/guns");
const {
  AddNewUnseenObject,
  isPositionOutsideMapBounds,
} = require("../../utils/game");
const { GlobalRoomConfig } = require("../../config/server");
const { sweptSATRectVsRect, Vec2 } = require("../../utils/bulletcollision");
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
    this.updatesTick = 1000;
    this.directionChange = data.directionChange || null;
    this.updates_per_tick = data.updates_per_tick
    this.effect = 1;
    //this.effect = 1
  }

  applyDirectionChange() {
    if (!this.directionChange) return;
    const dc = this.directionChange;
    if (dc.type === 1) this.direction += Math.sin(this.lifeTicks * dc.frequency) * dc.amplitude;
    if (dc.type === 2) this.direction += (dc.turnRate * (GlobalRoomConfig.ticks_per_second / this.updates_per_tick)),
    this.dirVec = Vec2.fromAngle(this.direction - 90);
  }

  nextPosition() { return this.position.add(this.dirVec.scale(this.speed)); }
  kill() { this.alive = false; }
  isExpired() { return !this.alive || Date.now() > this.maxTime; }
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

  generateBulletId() {
    const id = this.nextBulletId++;
    if (this.nextBulletId > 655) this.nextBulletId = 1;
    return id;
  }

  spawnBullet(player, bulletData) {
    const id = this.generateBulletId();
    const baseDir = Vec2.fromAngle(bulletData.angle);
    const perpDir = Vec2.fromAngle(bulletData.angle - 90);
    const initialPosition = new Vec2(player.position.x, player.position.y)
      .add(baseDir.scale(bulletData.offset))
      .add(perpDir.scale(25));

    const bullet = new Bullet({
      id,
      position: initialPosition,
      startPosition: initialPosition,
      direction: bulletData.angle,
      speed: bulletData.speed,
      directionChange: bulletData.directionChange,
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
      updateTicks: 0,
      updates_per_tick: bulletData.updates_per_tick,
      client_render_speed: bulletData.client_render_speed,
    });

    this.bullets.set(id, bullet);
    this.room.grid.addObject(bullet);
    return bullet;
  }

  update() {
    this.processScheduledBullets();
    const toRemove = [];

    for (const [id, bullet] of this.bullets.entries()) {
      if (!bullet || !bullet.alive || bullet.isExpired()) { toRemove.push(id); continue; }
      bullet.updateTicks++;
      if (bullet.updateTicks > GlobalRoomConfig.ticks_per_second / bullet.updates_per_tick - 1) {
        bullet.updateTicks = 0;
        if (this.directionChange) this.directionChange.lifeTicks++;
        bullet.applyDirectionChange();

        const prevPos = bullet.position;
        const nextPos = bullet.nextPosition();
        this.room.grid.updateObject(bullet, nextPos);
        if (isPositionOutsideMapBounds(this.room, prevPos)) { toRemove.push(id); continue; }

        const halfW = bullet.width;
        const halfH = bullet.height;
        const minX = Math.min(prevPos.x, nextPos.x) - halfW;
        const maxX = Math.max(prevPos.x, nextPos.x) + halfW;
        const minY = Math.min(prevPos.y, nextPos.y) - halfH;
        const maxY = Math.max(prevPos.y, nextPos.y) + halfH;

        // WALL COLLISION
        const nearbyWalls = this.room.grid.getObjectsInArea(minX, maxX, minY, maxY, "wall");
        let wallHits = [];
        for (const wall of nearbyWalls) {
          const res = sweptSATRectVsRect(prevPos, nextPos, bullet.width, bullet.height, (bullet.direction - 90) * Math.PI/180,
                                         wall.position, wall.width, wall.height, wall.angle || 0);
          if (res.hit) wallHits.push({ wall, t: res.t });
        }
        wallHits.sort((a, b) => a.t - b.t);

        let currPos = prevPos;
        let fullVec = new Vec2(nextPos.x - prevPos.x, nextPos.y - prevPos.y);
        let remainingVec = fullVec;
        let bulletDestroyed = false;

        if (wallHits.length > 0) {
          for (const hit of wallHits) {
            const hitPos = new Vec2(currPos.x + remainingVec.x * hit.t, currPos.y + remainingVec.y * hit.t);
            if (bullet.modifiers.size) {
              for (const mod of bullet.modifiers) {
                if (mod === "DestroyWalls(DestroySelf)") { DestroyWall(hit.wall, this.room); bulletDestroyed = true; break; }
                if (mod === "DestroyWalls") DestroyWall(hit.wall, this.room);
              }
            } else bulletDestroyed = true;

            currPos = hitPos;
            if (bulletDestroyed) break;
            remainingVec = new Vec2(nextPos.x - currPos.x, nextPos.y - currPos.y);
          }
        }

        // PLAYER/BOT COLLISION (SAT)
        if (!bulletDestroyed) {
          const nearbyEntities = this.room.grid.getObjectsInArea(minX, maxX, minY, maxY, "player")
            .concat(this.room.grid.getObjectsInArea(minX, maxX, minY, maxY, "bot"));

          for (const obj of nearbyEntities) {
            if (!obj.alive || obj === bullet.owner || (obj.objectType === "player" && this.isAlly(bullet.owner, obj))) continue;

            const res = sweptSATRectVsRect(currPos, nextPos, bullet.width, bullet.height, (bullet.direction - 90) * Math.PI/180,
                                           obj.position, obj.width, obj.height, obj.angle || 0);

            if (res.hit) {
              const finalDamage = bullet.damageConfig.length
                ? calculateFinalDamage(Vec2.distanceSquared(bullet.startPosition, currPos), bullet.maxDistance, bullet.damage, bullet.damageConfig)
                : bullet.damage;

              if (obj.objectType === "player") {
                bullet.owner.HandleSelfBulletsOtherPlayerCollision(obj, finalDamage, bullet.gunId, this.room);
              } else if (obj.objectType === "bot") {
                obj.damage(finalDamage, bullet.owner);
              }

              if (bullet.afflictionConfig) {
                const a = bullet.afflictionConfig;
                this.room.activeAfflictions.push({ shootingPlayer: bullet.owner, target: obj, damage: a.damage, speed: a.waitTime, gunid: bullet.gunId, nextTick: Date.now() + a.waitTime, expires: Date.now() + a.activeTime });
              }

              bulletDestroyed = true;
              break;
            }
          }
        }

        if (bulletDestroyed) { toRemove.push(id); }
        else { bullet.prevPosition = prevPos; bullet.position = new Vec2(currPos.x + remainingVec.x, currPos.y + remainingVec.y); bullet.new = false; }

        if (!bullet.new) bullet.effect = 0
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
    this.scheduledBullets.push({ spawnTime: Date.now() + delayMs, owner: player, bulletData });
  }
}

/* =========================
   HELPERS
========================= */
function DestroyWall(wall, room) {
  room.grid.removeObject(wall);
  AddNewUnseenObject(room, { objectType: "static_obj", id: wall.gid, position: wall.position, sendx: wall.position.x, sendy: wall.position.y });
}

function calculateFinalDamage(distanceSquaredUsed, bulletMaxDistance, normalDamage, layers) {
  if (!layers.length) return normalDamage;
  const maxDistSq = bulletMaxDistance * bulletMaxDistance;
  for (const layer of layers) {
    const thresholdDistanceSq = (layer.threshold / 100) * maxDistSq;
    if (distanceSquaredUsed <= thresholdDistanceSq) return Math.ceil(normalDamage * layer.damageMultiplier);
  }
  return 0;
}

function handleBulletFired(room, player, gunType) {
  const gun = gunsconfig[gunType];
  const now = Date.now();
  if (player.shooting || now - (player.lastShootTime || 0) < gun.cooldown) return;
  player.shooting = true;
  player.lastShootTime = now;

  for (const bulletConfig of gun.bullets) {
    const bullet_tick_rate = 20;

    const bulletdata = {

      directionChange: bulletConfig.directionChange,
      client_render_speed: Math.round(bulletConfig.speed),
      speed: bulletConfig.speed * (GlobalRoomConfig.ticks_per_second / bullet_tick_rate),
      updates_per_tick: bullet_tick_rate,
      offset: bulletConfig.offset,
      damage: gun.damage,
      angle: bulletConfig.usePlayerAngle ? (player.shoot_direction + bulletConfig.angle) : bulletConfig.angle,
      height: gun.height,
      width: gun.width,
      maxtime: Date.now() + gun.maxexistingtime + bulletConfig.delay,
      distance: gun.distance,
      damageconfig: gun.damageconfig || [],
      afflictionConfig: gun.afflictionConfig || false,
      gunid: gunType,
      modifiers: gun.modifiers,

    }

    room.bulletManager.scheduleBullet(player, bulletdata, bulletConfig.delay);
  }

  room.setRoomTimeout(() => { player.shooting = false; }, gun.cooldown);
}

module.exports = {
  BulletManager,
  handleBulletFired,
  Vec2,
  sweptSATRectVsRect,
};
