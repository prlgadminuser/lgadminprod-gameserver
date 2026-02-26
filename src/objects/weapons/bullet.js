"use strict";


const { playerhitbox } = require("../../config/player");
const { gunsconfig} = require("../../config/guns")
const {
  AddNewUnseenObject,
  isPositionOutsideMapBounds,
} = require("../../utils/game");
const { GlobalRoomConfig } = require("../../config/server");


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
    return { hit: false };
  }

  // Y slab
  if (dy !== 0) {
    const ty1 = (minY - segStart.y) / dy;
    const ty2 = (maxY - segStart.y) / dy;
    tMin = Math.max(tMin, Math.min(ty1, ty2));
    tMax = Math.min(tMax, Math.max(ty1, ty2));
  } else if (segStart.y < minY || segStart.y > maxY) {
    return { hit: false };
  }

  if (tMax >= tMin && tMin <= 1 && tMax >= 0) {
    return {
      hit: true,
      t: tMin, // 👈 TIME OF IMPACT (0..1 along sweep)
      tExit: tMax,
    };
  }

  return { hit: false };
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
    this.updatesTick = 1000;
    this.effect = 1;
    //  this.updateTicks = 0

    this.directionChange = data.directionChange || null;
  }

  applyDirectionChange() {
    if (!this.directionChange) return;

    const dc = this.directionChange;

    // direction-aware steering sine
    if (dc.type === 1) {
      const turn = Math.sin(this.lifeTicks * dc.frequency) * dc.amplitude;
      this.direction += turn;
    }

    if (dc.type === 2) {
      this.direction += dc.turnRate;
    }

    this.dirVec = Vec2.fromAngle(this.direction - 90);
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
    if (this.nextBulletId > 655) this.nextBulletId = 1;
    return id;
  }

  spawnBullet(player, bulletData) {
    const id = this.generateBulletId();
    const angle = bulletData.angle;
    const offset = bulletData.offset;

    const baseDir = Vec2.fromAngle(angle);
    const perpDir = Vec2.fromAngle(angle - 90);

    const initialPosition = new Vec2(player.position.x, player.position.y)
      .add(baseDir.scale(offset))
      .add(perpDir.scale(25));

    const bullet = new Bullet({
      id,
      position: initialPosition,
      startPosition: initialPosition,
      direction: angle,
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
      if (!bullet || !bullet.alive || bullet.isExpired()) {
        toRemove.push(id);
        continue;
      }

      bullet.updateTicks++;

      if (
        bullet.updateTicks >
        GlobalRoomConfig.ticks_per_second / bullet.updates_per_tick - 1
      ) {
        bullet.updateTicks = 0;

        if (this.directionChange) this.directionChange.lifeTicks++;
        bullet.applyDirectionChange();

        const prevPos = bullet.position;
        const nextPos = bullet.nextPosition();

        this.room.grid.updateObject(bullet, nextPos);

        // map bounds check
        if (isPositionOutsideMapBounds(this.room, prevPos)) {
          toRemove.push(id);
          continue;
        }

        // ===== Broadphase =====
        const minX = Math.min(prevPos.x, nextPos.x) - bullet.width;
        const maxX = Math.max(prevPos.x, nextPos.x) + bullet.width;
        const minY = Math.min(prevPos.y, nextPos.y) - bullet.height;
        const maxY = Math.max(prevPos.y, nextPos.y) + bullet.height;

        /* ================= WALL PASS (MULTI-HIT CCD) ================= */
        const nearbyWalls = this.room.grid.getObjectsInArea(
          minX,
          maxX,
          minY,
          maxY,
          "wall",
        );

        const wallHits = [];

        for (const wall of nearbyWalls) {
          const res = sweptRectAABB(
            prevPos,
            nextPos,
            wall.position,
            wall.width,
            wall.height,
            bullet.width,
            bullet.height,
          );

          if (res && res.hit) {
            wallHits.push({
              wall,
              t: res.t, // time-of-impact (0..1)
            });
          }
        }

        // sort by physical impact order
        wallHits.sort((a, b) => a.t - b.t);

        let currPos = prevPos;
        let fullVec = new Vec2(nextPos.x - prevPos.x, nextPos.y - prevPos.y);

        let remainingVec = fullVec;
        let bulletDestroyed = false;

        /* ================= WALL RESOLUTION ================= */
        if (wallHits.length > 0) {
          for (const hit of wallHits) {
            const hitPos = new Vec2(
              currPos.x + remainingVec.x * hit.t,
              currPos.y + remainingVec.y * hit.t,
            );

            if (bullet.modifiers.size) {
              for (const modifier of bullet.modifiers) {
                switch (modifier) {
                  case "DestroyWalls(DestroySelf)":
                    DestroyWall(hit.wall, this.room);
                    bulletDestroyed = true;
                    break;

                  case "DestroyWalls":
                    DestroyWall(hit.wall, this.room);
                    // bullet continues
                    break;

                  default:
                    bulletDestroyed = true;
                    break;
                }
              }
            } else {
              // normal bullet hits wall and dies
              bulletDestroyed = true;
            }

            if (bulletDestroyed) {
              currPos = hitPos;
              break;
            }

            // advance sweep after this hit
            currPos = hitPos;
            remainingVec = new Vec2(
              nextPos.x - currPos.x,
              nextPos.y - currPos.y,
            );
          }
        }

        /* ================= PLAYER PASS ================= */
        if (!bulletDestroyed) {
          const nearbyPlayers = this.room.grid.getObjectsInArea(
            minX,
            maxX,
            minY,
            maxY,
            "player",
          );

          for (const obj of nearbyPlayers) {
            if (
              !obj.alive ||
              obj === bullet.owner ||
              this.isAlly(bullet.owner, obj)
            )
              continue;

            const res = sweptRectAABB(
              currPos,
              nextPos,
              obj.position,
              obj.width,
              obj.height,
              bullet.width,
              bullet.height,
            );

            if (res && res.hit) {
              const finalDamage = bullet.damageConfig.length
                ? calculateFinalDamage(
                    Vec2.distanceSquared(bullet.startPosition, currPos),
                    bullet.maxDistance,
                    bullet.damage,
                    bullet.damageConfig,
                  )
                : bullet.damage;

              bullet.owner.HandleSelfBulletsOtherPlayerCollision(
                obj,
                finalDamage,
                bullet.gunId,
                this.room,
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

              bulletDestroyed = true;
              break;
            }
          }
        }

        /* ================= FINAL MOVE / KILL ================= */
        if (bulletDestroyed) {
          toRemove.push(id);
        } else {
          const finalPos = new Vec2(
            currPos.x + remainingVec.x,
            currPos.y + remainingVec.y,
          );

          bullet.prevPosition = prevPos;
          bullet.position = finalPos;
          bullet.new = false;
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
  const { x, y } = wall.position;
  AddNewUnseenObject(room, {
    objectType: "static_obj",
    id: wall.gid,
    position: wall.position,
    sendx: x,
    sendy: y,
  });
}

function calculateFinalDamage(
  distanceSquaredUsed,
  bulletMaxDistance,
  normalDamage,
  layers,
) {
  if (!layers.length) return normalDamage;
  const maxDistSq = bulletMaxDistance * bulletMaxDistance;

  for (const layer of layers) {
    const thresholdDistanceSq = (layer.threshold / 100) * maxDistSq;
    if (distanceSquaredUsed <= thresholdDistanceSq)
      return Math.ceil(normalDamage * layer.damageMultiplier);
  }
  return 0;
}


const bulletTickRatePreset = {
  "LOW": 5,
  "NORMAL": 10,
  "HIGH": 20
}

function handleBulletFired(room, player, gunType) {
  const gun = gunsconfig[gunType];
  const now = Date.now();

  if (player.shooting || now - (player.lastShootTime || 0) < gun.cooldown)
    return;

  player.shooting = true;
  player.lastShootTime = now;

  const baseAngle = gun.useplayerangle ? player.shoot_direction : 0;

  for (const bulletConfig of gun.bullets) {
    const bullet_tick_rate = 20; 

    const calculated_tick_rate =  Math.min(GlobalRoomConfig.ticks_per_second, Math.round(bulletConfig.speed * 3))
    

  /*    directionChange: {
      type: 1,
    amplitude: 10,
    frequency: 0.15,
    lifeTicks: 0,
    },

      directionChange: {
      type: 2,
      turnRate: 0,
    },

    */
  

    room.bulletManager.scheduleBullet(
      player,
      {
        client_render_speed: Math.round(bulletConfig.speed),
        speed:
          bulletConfig.speed *
          (GlobalRoomConfig.ticks_per_second / bullet_tick_rate),
        updates_per_tick: bullet_tick_rate,
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
      bulletConfig.delay,
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
};
