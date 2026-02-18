"use strict";

const { gunsconfig } = require("../config/guns");
const { playerhitbox } = require("../config/player");
const { GlobalRoomConfig } = require("../config/server");
const {
  isCollisionWithPlayer,
  getCollidedWallsWithBullet,
} = require("../utils/collision");
const { AddNewUnseenObject } = require("../utils/game");
const { isPositionOutsideMapBounds } = require("../utils/math");

const playerWidth = playerhitbox.width;
const playerHeight = playerhitbox.height;

const halfBlockSize = 30;

function adjustBulletDirection(bullet, wall) {
  // --- Define wall rectangle ---
  const wallLeft = wall.x - halfBlockSize;
  const wallRight = wall.x + halfBlockSize;
  const wallTop = wall.y - halfBlockSize;
  const wallBottom = wall.y + halfBlockSize;

  // Compute distances to each wall side
  const distLeft = Math.abs(bullet.position.x - wallLeft);
  const distRight = Math.abs(bullet.position.x - wallRight);
  const distTop = Math.abs(bullet.position.y - wallTop);
  const distBottom = Math.abs(bullet.position.y - wallBottom);

  const minDistX = Math.min(distLeft, distRight);
  const minDistY = Math.min(distTop, distBottom);

  // Determine collision normal
  let normal;
  if (minDistX < minDistY) {
    // Horizontal collision → normal points along X axis
    normal = { x: 1, y: 0 };
    if (distRight < distLeft) normal.x = -1; // hit right side
  } else {
    // Vertical collision → normal points along Y axis
    normal = { x: 0, y: 1 };
    if (distBottom < distTop) normal.y = -1; // hit bottom
  }

  // Reflect bullet using stored velocity vector
  bullet.bounce(normal);
}

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

  static distanceSquared(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
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
    afflictionConfig,
    gunId,
    modifiers,
    owner,
    updates_per_tick,
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
    this.afflictionConfig = afflictionConfig;
    this.gunId = Number(gunId);
    this.modifiers = modifiers;
    this.owner = owner;
    this.startPosition = position;
    this.spawnTime = Date.now();
    this.alive = true;
    this.new = true;
    this.effect = 1; // firing effect at spawn

    this.updates_per_tick = updates_per_tick;

    this.dirVec = Vec2.fromAngle(direction - 90);
  }

  nextPosition() {
    // Move bullet along direction by speed units per tick
    const dirVec = Vec2.fromAngle(this.direction - 90);
    return this.position.add(dirVec.scale(this.speed));
  }

  bounce(normal) {
    const dot = this.dirVec.x * normal.x + this.dirVec.y * normal.y;
    this.dirVec.x -= 2 * dot * normal.x;
    this.dirVec.y -= 2 * dot * normal.y;
    this.direction =
      (Math.atan2(this.dirVec.y, this.dirVec.x) * 180) / Math.PI + 90;
    // Move bullet slightly out of wall
    this.position.x += this.dirVec.x * 0.5;
    this.position.y += this.dirVec.y * 0.5;
  }

  isExpired() {
    if (!this.alive) return true;
    if (Date.now() > this.maxTime) return true;
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
    this.bullets = room.bullets; // id => Bullet
    this.scheduledBullets = [];
    this.nextBulletId = 1;
    this.bulletUpdatesTick = 0;
  }

  generateBulletId() {
    const id = this.nextBulletId;
    this.nextBulletId += 1;
    // wrap around if very large
    if (this.nextBulletId > 655) this.nextBulletId = 1;
    return id;
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

    const roundeddata = {
      x: Math.round(player.x),
      y: Math.round(player.y),
      d: Math.round(angle),
    };
    const bullet = new Bullet({
      id,
      startPosition: initialPosition,
      position: initialPosition,
      serialized: roundeddata,
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

      updates_per_tick: bulletData.updates_per_tick,
    });

    bullet.x = initialPosition.x;
    bullet.y = initialPosition.y;
    bullet.objectType = "bullet";
    bullet.updateTicks = 0;

    this.bullets.set(id, bullet);
    this.room.grid.addObject(bullet);

    return bullet;
  }

  update() {
    this.processScheduledBullets();
    const toRemove = [];

    // if (this.room.bulletUpdateTick ==! 2) {
    //  this.room.bulletUpdateTick++
    //   return
    // }

    //this.room.bulletUpdateTick = 0

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

        const nextPos = bullet.nextPosition();
        bullet.position = nextPos;
        bullet.x = nextPos.x;
        bullet.y = nextPos.y;
        this.room.grid.updateObject(bullet, nextPos.x, nextPos.y);

       let collided = false;

      if (isPositionOutsideMapBounds(this.room, bullet.position.x, bullet.position.y)) {

        toRemove.push(id);
        collided = true;
        break
      }

        const centerX = bullet.position.x;
        const centerY = bullet.position.y;
        const threshold = Math.max(bullet.width, bullet.height);
        const xThreshold = threshold + playerWidth;
        const yThreshold = threshold + playerHeight;
        // Single call to getObjectsInArea
        const nearbyWalls = this.room.grid.getObjectsInArea(
          centerX - xThreshold,
          centerX + xThreshold,
          centerY - yThreshold,
          centerY + yThreshold,
          "wall",
        );

        const nearbyPlayers = this.room.grid.getObjectsInArea(
          centerX - xThreshold,
          centerX + xThreshold,
          centerY - yThreshold,
          centerY + yThreshold,
          "player",
        );

        let newEffect = 0;

        const collidedWalls = getCollidedWallsWithBullet(
          // check which of potential walls collide exactly
          nearbyWalls,
          nextPos.x,
          nextPos.y,
          bullet.height,
          bullet.width,
          bullet.direction - 90,
        );

        for (const wall of collidedWalls) {
          if (GunHasModifier("DestroyWalls", this.room, bullet.modifiers)) {
            DestroyWall(wall, this.room);
            newEffect = 3;
          } else if (
            GunHasModifier(
              "DestroyWalls(DestroyBullet)",
              this.room,
              bullet.modifiers,
            )
          ) {
            DestroyWall(wall, this.room);
            toRemove.push(id);
          } else if (GunHasModifier("CanBounce", this.room, bullet.modifiers)) {
            adjustBulletDirection(bullet, wall);
            newEffect = 2;
          } else {
            toRemove.push(id);
          }
          collided = true;
          break;
        }

        for (const obj of nearbyPlayers) {
          if (
            //    obj.objectType === "player" &&
            obj.alive &&
            obj !== bullet.owner &&
            !this.isAlly(bullet.owner, obj)
          ) {
            if (
              isCollisionWithPlayer(
                bullet,
                obj,
                bullet.height,
                bullet.width,
                bullet.direction - 90,
              )
            ) {
              const finalDamage = bullet.damageConfig.length
                ? calculateFinalDamage(
                    Vec2.distanceSquared(bullet.startPosition, bullet.position),
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
                const afflictionConfig = bullet.afflictionConfig;
                this.room.activeAfflictions.push({
                  shootingPlayer: bullet.owner,
                  target: obj,
                  target_type: "player",
                  damage: afflictionConfig.damage,
                  speed: afflictionConfig.waitTime, // interval between hits in ms
                  gunid: bullet.gunId,
                  nextTick: Date.now() + afflictionConfig.waitTime, // first tick time
                  expires: Date.now() + afflictionConfig.activeTime, // when this effect ends
                });
              }

              toRemove.push(id);
              collided = true;
              break;
            }
          }

          if (obj.objectType === "dummy") {
            if (
              isCollisionWithPlayer(
                bullet,
                obj,
                bullet.height,
                bullet.width,
                bullet.direction - 90,
              )
            ) {
              const finalDamage = bullet.damageConfig.length
                ? calculateFinalDamage(
                    Vec2.distanceSquared(bullet.startPosition, bullet.position),
                    bullet.maxDistance,
                    bullet.damage,
                    bullet.damageConfig,
                  )
                : bullet.damage;

              handleDummyCollision(
                this.room,
                bullet.owner,
                obj.id,
                finalDamage,
              );
              toRemove.push(id);
              collided = true;
              break;
            }
          }
        }

        if (!collided) {
          bullet.effect = bullet.new ? 1 : newEffect;
        }

        bullet.new = false;
      }
    }

    for (const id of toRemove) {
      this.killBullet(id);
    }
  }

  killBullet(bulletId) {
    const bullet = this.bullets.get(bulletId);
    if (!bullet) return;

    this.room.grid.removeObject(bullet);
    bullet.kill();
    this.bullets.delete(bulletId);
  }

  isAlly(owner, otherPlayer) {
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
        const player = scheduled.owner;
        if (player) {
          this.spawnBullet(player, scheduled.bulletData);
        }
        this.scheduledBullets.splice(i, 1);
      }
    }
  }

  scheduleBullet(player, bulletData, delayMs) {
    const spawnTime = Date.now() + delayMs;
    this.scheduledBullets.push({
      spawnTime,
      owner: player,
      bulletData,
    });
  }
}

// ---------- Helper Functions (stub these with your existing implementations) ----------

function GunHasModifier(name, room, modifiers) {
  return modifiers.has(name) || room.weapons_modifiers_override.has(name);
}

function DestroyWall(wall, room) {
  room.grid.removeObject(wall);
  const obj = {
    objectType: "static_obj",
    id: wall.gid,
    x: wall.x,
    y: wall.y,
    sendx: wall.x,
    sendy: wall.y,
  }; // id for wall removal object: 1

  // console.log(obj)
  AddNewUnseenObject(room, obj);
}

function calculateFinalDamage(
  distanceSquaredUsed,
  bulletMaxDistance,
  normalDamage,
  layers,
) {
  if (!Array.isArray(layers) || layers.length === 0) return normalDamage;
  const maxDistSq = bulletMaxDistance * bulletMaxDistance;

  for (const layer of layers) {
    const thresholdDistanceSq = (layer.threshold / 100) * maxDistSq;
    if (distanceSquaredUsed <= thresholdDistanceSq)
      return Math.ceil(normalDamage * layer.damageMultiplier);
  }
  return 0;
}

function handleBulletFired(room, player, gunType) {
  const gun = gunsconfig[gunType];
  const currentTime = Date.now();

  // Prevent shooting if player is already shooting or cooldown not passed
  if (
    player.shooting ||
    currentTime - (player.lastShootTime || 0) < gun.cooldown
  ) {
    return;
  }

  player.shooting = true;
  player.lastShootTime = currentTime;

  // Base angle
  const baseAngle = gun.useplayerangle ? player.shoot_direction : 0;

  // For each bullet config, fire respecting its own delay

  for (const bulletConfig of gun.bullets) {
    const UpdatesBetweenTicks = Math.min(
      40,
      Math.round(bulletConfig.speed * 3),
    ); // calculate an optimal tick rate - slower bullets typically need less updates

    // const UpdatesBetweenTicks = bulletConfig.speed > 20 ? 40 : 20

    //console.log(GlobalRoomConfig.ticks_per_second / UpdatesBetweenTicks)
    // console.log(bulletConfig.speed / (GlobalRoomConfig.ticks_per_second / UpdatesBetweenTicks))

    room.bulletManager.scheduleBullet(
      player,
      {
        speed: Math.round(bulletConfig.speed),
        //speed_client: Math.round(bulletConfig.speed / (GlobalRoomConfig.ticks_per_second / UpdatesBetweenTicks)),
        updates_per_tick: UpdatesBetweenTicks,
        offset: bulletConfig.offset,
        damage: gun.damage,
        angle: gun.useplayerangle
          ? bulletConfig.angle + baseAngle
          : bulletConfig.angle,
        height: gun.height / 2.5,
        width: gun.width / 2.5,
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

  // Reset shooting state after cooldown
  room.setRoomTimeout(() => {
    player.shooting = false;
  }, gun.cooldown);
}

module.exports = {
  BulletManager,
  handleBulletFired,
  Vec2,
};
