"use strict";

const { gunsconfig } = require("../config/guns");
const { playerhitbox } = require("../config/player");
const { isCollisionWithPlayer, getCollidedWallsWithBullet } = require("../utils/collision");
const { AddNewUnseenObject } = require("../utils/game");

const playerWidth = playerhitbox.width;
const playerHeight = playerhitbox.height;

const halfBlockSize = 40;

function adjustBulletDirection(bullet, wall) {
  const bulletVector = Vec2.fromAngle(bullet.direction - 90); // current velocity vector

  // Define wall rectangle
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

  // Reflect the vector: R = V - 2*(V·N)*N
  const dot = bulletVector.x * normal.x + bulletVector.y * normal.y;
  const reflected = {
    x: bulletVector.x - 2 * dot * normal.x,
    y: bulletVector.y - 2 * dot * normal.y,
  };

  // Reduce speed slightly to avoid ping-pong sticking
  bullet.direction =
    Math.atan2(reflected.y, reflected.x) * (180 / Math.PI) + 90;

  // Move bullet slightly out of wall to prevent repeated collision
  bullet.position.x += reflected.x * 0.5;
  bullet.position.y += reflected.y * 0.5;
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
    owner,
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
    this.owner = owner;
    this.startPosition = position;
    this.spawnTime = Date.now();
    this.alive = true;
    this.new = true;
    this.effect = 1; // firing effect at spawn
  }

  nextPosition() {
    // Move bullet along direction by speed units per tick
    const dirVec = Vec2.fromAngle(this.direction - 90);
    return this.position.add(dirVec.scale(this.speed));
  }

  FormatForSending() {
    this.serialized = {
      x: Math.round(this.position.x),
      y: Math.round(this.position.y),
      d: Math.round(this.direction),
    };
  }

  isExpired() {
    if (!this.alive) return true;
    if (Date.now() > this.maxTime) return true;
    if (this.position.distanceTo(this.startPosition) > this.maxDistance)
      return true;
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
      gunId: bulletData.gunid,
      modifiers: bulletData.modifiers,
      ownerId: player.playerId,
    });

    bullet.x = initialPosition.x;
    bullet.y = initialPosition.y;
    bullet.type = "bullet";

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

      const nextPos = bullet.nextPosition();
      bullet.position = nextPos;
      bullet.x = nextPos.x;
      bullet.y = nextPos.y;
      bullet.FormatForSending();
      this.room.grid.updateObject(bullet, nextPos.x, nextPos.y);

      const centerX = bullet.position.x;
      const centerY = bullet.position.y;
      const threshold = Math.max(bullet.width, bullet.height);
      const xThreshold = threshold + playerWidth;
      const yThreshold = threshold + playerHeight;
      // Single call to getObjectsInArea
      const nearbyObjects = this.room.grid.getObjectsInArea(
        centerX - xThreshold,
        centerX + xThreshold,
        centerY - yThreshold,
        centerY + yThreshold,
        null,
        true
      );

      let newEffect = 0;
      let collided = false;

      const nearbyWalls = Array.from(nearbyObjects).filter(obj => obj.type === "wall");

      const collidedWalls = getCollidedWallsWithBullet(
        // check which of potential walls collide exactly
        nearbyWalls,
        nextPos.x,
        nextPos.y,
        bullet.height,
        bullet.width,
        bullet.direction - 90
      );

      for (const wall of collidedWalls) {
        if (GunHasModifier("DestroyWalls", this.room, bullet.modifiers)) {
          DestroyWall(wall, this.room);
          newEffect = 3;
        } else if (
          GunHasModifier(
            "DestroyWalls(DestroyBullet)",
            this.room,
            bullet.modifiers
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

      for (const obj of nearbyObjects) {
        if (
          obj.type === "player" &&
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
              bullet.direction - 90
            )
          ) {
            const distTraveled = bullet.position.distanceTo(
              bullet.startPosition
            );
            const finalDamage = calculateFinalDamage(
              distTraveled,
              bullet.maxDistance,
              bullet.damage,
              bullet.damageConfig
            );

            bullet.owner.HandleSelfBulletsOtherPlayerCollision(obj, finalDamage, bullet.gunId)

           if (bullet.afflictionConfig) {
            const afflictionConfig = bullet.afflictionConfig
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

        if (obj.type === "dummy") {
          if (
            isCollisionWithPlayer(
              bullet,
              obj,
              bullet.height,
              bullet.width,
              bullet.direction - 90
            )
          ) {
            const distTraveled = bullet.position.distanceTo(
              bullet.startPosition
            );
            const finalDamage = calculateFinalDamage(
              distTraveled,
              bullet.maxDistance,
              bullet.damage,
              bullet.damageConfig
            );
            handleDummyCollision(
              this.room,
              bullet.owner,
              obj.id,
              finalDamage
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
    type: "static_obj",
    id: wall.gid,
    x: wall.x,
    y: wall.y,
    sendx: wall.x / 10,
    sendy: wall.y / 10,
  }; // id for wall removal object: 1
  AddNewUnseenObject(room, obj);
}

function calculateFinalDamage(
  distanceUsed,
  bulletMaxDistance,
  normalDamage,
  layers
) {
  if (!Array.isArray(layers) || layers.length === 0) return normalDamage;
  for (const layer of layers) {
    const thresholdDistance = (layer.threshold / 100) * bulletMaxDistance;
    if (distanceUsed <= thresholdDistance)
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
    room.bulletManager.scheduleBullet(
      player,
      {
        speed: Math.round(bulletConfig.speed),
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
        gunid: gunType,
        modifiers: gun.modifiers,
      },
      bulletConfig.delay
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
