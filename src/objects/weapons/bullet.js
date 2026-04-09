"use strict";

const { gunsconfig } = require("../../config/guns");
const { AddNewUnseenObject, isPositionOutsideMapBounds } = require("../../utils/game");
const { GlobalRoomConfig } = require("../../config/server");
const { sweptSATRectVsRect, Vec2 } = require("../../utils/bulletcollision");
const { PoisonDamageHandler } = require("./weapon-effects");

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
    this.updateTicks = 0;
    this.lifeTicks = 0;
    this.effect = 1;
    this.new = true
    this.collidedEntities = new Set()
  }

  applyDirectionChange() {
    if (!this.directionChange) return;
    const { type, frequency, amplitude, turnRate } = this.directionChange;
    this.lifeTicks++;

    if (type === 1) this.direction += Math.sin(this.lifeTicks * frequency) * amplitude;
    else if (type === 2) this.direction += turnRate * (GlobalRoomConfig.ticks_per_second / this.updates_per_tick);

    this.dirVec = Vec2.fromAngle(this.direction - 90);
  }

  nextPosition() {
    return this.position.add(this.dirVec.scale(this.speed));
  }

  kill() {
    this.alive = false;
  }

  isExpired() {
    return !this.alive || Date.now() > this.maxTime;
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

  generateBulletId() {
    const id = this.nextBulletId++;
    if (this.nextBulletId > 655) this.nextBulletId = 1;
    return id;
  }

  spawnBullet(player, bulletData) {
    const id = this.generateBulletId();
    const baseDir = Vec2.fromAngle(bulletData.angle);
    const perpDir = Vec2.fromAngle(bulletData.angle - 90);
    const position = new Vec2(player.position.x, player.position.y)
      .add(baseDir.scale(bulletData.offset || 0))
      .add(perpDir.scale(25));

      const teamid = player.team.id


    const bullet = new Bullet({ id, position, startPosition: position, direction: bulletData.angle, owner: player, objectType: "bullet", teamid: teamid, ...bulletData });
    this.bullets.set(id, bullet);
    this.room.grid.addObject(bullet);
    return bullet;
  }

  update() {
    PoisonDamageHandler(this.room);
    this.processScheduledBullets();

    const toRemove = [];

    for (const [id, bullet] of this.bullets.entries()) {
      if (!bullet.alive || bullet.isExpired()) { toRemove.push(id); continue; }

      bullet.updateTicks++;
      if (bullet.updateTicks < GlobalRoomConfig.ticks_per_second / bullet.updates_per_tick) continue;

      bullet.updateTicks = 0;
      bullet.applyDirectionChange();

      const prevPos = bullet.position;
      const nextPos = bullet.nextPosition();

      if (isPositionOutsideMapBounds(this.room, prevPos)) { toRemove.push(id); continue; }

      this.room.grid.updateObject(bullet, nextPos);

      const potentialHits = this.getPotentialHits(bullet, prevPos, nextPos) 

      let currPos = prevPos;
      let remainingVec = nextPos.subtract(currPos);
      let destroyed = false;

      for (const hit of potentialHits) {
        const hitPos = currPos.add(remainingVec.scale(hit.t));

        if (hit.type === "wall") destroyed = this.handleWallHit(hit.obj, bullet);
        else if (hit.type === "entity" && !bullet.collidedEntities.has(hit.obj)) destroyed = this.handleEntityHit(hit.obj, bullet, currPos);

        currPos = hitPos;
        if (destroyed) break;
        remainingVec = nextPos.subtract(currPos);
      }


      if (destroyed) toRemove.push(id);
      else { bullet.prevPosition = prevPos; bullet.position = currPos.add(remainingVec); bullet.new = false; }

      if (!bullet.new) bullet.effect = 0;
    }

    toRemove.forEach(id => this.killBullet(id));
  }

  getPotentialHits(bullet, prevPos, nextPos) {
    const halfW = bullet.width / 2, halfH = bullet.height / 2;
    const minX = Math.min(prevPos.x, nextPos.x) - halfW, maxX = Math.max(prevPos.x, nextPos.x) + halfW;
    const minY = Math.min(prevPos.y, nextPos.y) - halfH, maxY = Math.max(prevPos.y, nextPos.y) + halfH;
    const hits = [];

    for (const wall of this.room.grid.getObjectsInArea(minX, maxX, minY, maxY, "wall")) {
      const res = sweptSATRectVsRect(prevPos, nextPos, bullet.width, bullet.height, (bullet.direction - 90) * Math.PI / 180, wall.position, wall.width, wall.height, wall.angle || 0);
      if (res.hit) hits.push({ obj: wall, t: res.t, type: "wall" });
    }

    const entities = [...this.room.grid.getObjectsInArea(minX, maxX, minY, maxY, "player"), ...this.room.grid.getObjectsInArea(minX, maxX, minY, maxY, "bot")];
    for (const entity of entities) {
      if (!entity.alive || entity === bullet.owner || this.isAlly(bullet.owner, entity)) continue;
      const res = sweptSATRectVsRect(prevPos, nextPos, bullet.width, bullet.height, (bullet.direction - 90) * Math.PI / 180, entity.position, entity.width, entity.height, entity.angle || 0);
      if (res.hit) hits.push({ obj: entity, t: res.t, type: "entity" });
    }

    return hits.sort((a, b) => a.t - b.t);
  }

  handleWallHit(wall, bullet) {
    if (bullet.modifiers?.has("DestroyWalls(DestroySelf)")) { DestroyWall(wall, this.room); return true; }
    if (bullet.modifiers?.has("DestroyWalls")) DestroyWall(wall, this.room);
    return !bullet.modifiers?.has("DestroyWalls");
  }

  handleEntityHit(entity, bullet, currPos) {

    bullet.collidedEntities.add(entity)

    const finalDamage = bullet.damageConfig?.length
      ? calculateFinalDamage(Vec2.distanceSquared(bullet.startPosition, currPos), bullet.maxDistance, bullet.damage, bullet.damageConfig)
      : bullet.damage;

    if (entity.objectType === "player") bullet.owner.HandleSelfBulletsOtherPlayerCollision(entity, finalDamage, bullet.gunId, this.room);
    else if (entity.objectType === "bot") entity.damage(finalDamage, bullet.owner);

    if (bullet.afflictionConfig) {
      const { damage, waitTime, activeTime, gunId } = bullet.afflictionConfig;
      this.room.activeAfflictions.push({ shootingPlayer: bullet.owner, target: entity, damage, speed: waitTime, gunid: gunId, nextTick: Date.now() + waitTime, expires: Date.now() + activeTime });
    }

    const isGhost = bullet.modifiers?.has("GhostBullet");
  return !isGhost;
  }

  killBullet(bulletId) {
    const bullet = this.bullets.get(bulletId);
    if (!bullet) return;
    this.room.grid.removeObject(bullet);
    bullet.kill();
    this.bullets.delete(bulletId);
  }

  isAlly(owner, other) {
    return owner?.id !== other?.id && this.room.IsTeamMode && owner?.team.id === other?.team.id;
  }

  processScheduledBullets() {
    const now = Date.now();
    this.scheduledBullets = this.scheduledBullets.filter(s => {
      if (now >= s.spawnTime) this.spawnBullet(s.owner, s.bulletData);
      else return true;
    });
  }

  scheduleBullet(player, bulletData, delayMs) {
    this.scheduledBullets.push({ spawnTime: Date.now() + delayMs, owner: player, bulletData });
  }
}

function DestroyWall(wall, room) {
  room.grid.removeObject(wall);
  AddNewUnseenObject(room, { objectType: "static_obj", id: wall.gid, position: wall.position, sendx: wall.position.x, sendy: wall.position.y });
}

function calculateFinalDamage(distanceSq, maxDistance, baseDamage, layers) {
  if (!layers.length) return baseDamage;
  const maxDistSq = maxDistance * maxDistance;
  for (const layer of layers) {
    if (distanceSq <= (layer.threshold / 100) * maxDistSq) return Math.ceil(baseDamage * layer.damageMultiplier);
  }
  return 0;
}

function handleBulletFired(room, player, gunType) {
  const gun = gunsconfig[gunType];
  const now = Date.now();
  if (player.shooting || now - (player.lastShootTime || 0) < gun.cooldown) return;

  player.shooting = true;
  player.lastShootTime = now;

  const bullet_tick_rate = GlobalRoomConfig.ticks_per_second;

  gun.bullets.forEach(bulletConfig => {
    const bulletData = {
      ...gun,
      ...bulletConfig,
      client_render_speed: Math.round(bulletConfig.speed),
      speed: bulletConfig.speed * (GlobalRoomConfig.ticks_per_second / bullet_tick_rate),
      updates_per_tick: bullet_tick_rate,
      angle: Math.round(bulletConfig.usePlayerAngle ? player.shoot_direction + bulletConfig.angle : bulletConfig.angle),
      maxTime: Date.now() + gun.maxexistingtime + bulletConfig.delay,
      gunId: gunType,
    };
    room.bulletManager.scheduleBullet(player, bulletData, bulletConfig.delay);
  });

  room.setRoomTimeout(() => { player.shooting = false; }, gun.cooldown);
}

module.exports = { BulletManager, handleBulletFired, Vec2, sweptSATRectVsRect };