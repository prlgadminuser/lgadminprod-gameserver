"use strict";

const { playerhitbox } = require("../../config/player");
const { AddNewUnseenObject } = require("../../utils/game");

const playerWidth = playerhitbox.width;
const playerHeight = playerhitbox.height;

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
}

/* =========================
   MELEE ATTACK INSTANCE
========================= */
class MeleeAttack {
  constructor(data) {
    Object.assign(this, data);

    this.spawnTime = Date.now();
    this.alive = true;
    this.hitTargets = new Set(); // prevent multi-hit in same swing
  }

  kill() {
    this.alive = false;
  }

  isExpired() {
    return Date.now() > this.expires;
  }
}

/* =========================
   MELEE MANAGER
========================= */
class MeleeManager {
  constructor(room) {
    this.room = room;
    this.attacks = [];
  }

  spawnMelee(player, meleeData) {
    const attack = new MeleeAttack({
      owner: player,
      weaponId: meleeData.weaponId,
      damage: meleeData.damage,
      range: meleeData.range,
      arc: meleeData.arc, // degrees
      duration: meleeData.duration,
      hitbox: meleeData.hitbox,
      afflictionConfig: meleeData.afflictionConfig || false,
      expires: Date.now() + meleeData.duration,
    });

    this.attacks.push(attack);
    return attack;
  }

  update() {
    for (let i = this.attacks.length - 1; i >= 0; i--) {
      const attack = this.attacks[i];

      if (!attack.alive || attack.isExpired()) {
        this.attacks.splice(i, 1);
        continue;
      }

      this.processAttack(attack);
    }
  }

  processAttack(attack) {
    const owner = attack.owner;
    if (!owner || !owner.alive) {
      attack.kill();
      return;
    }

    const origin = owner.position;
    const dir = Vec2.fromAngle(owner.shoot_direction - 90);

    // center of melee hitbox in front of player
    const hitCenter = origin.add(dir.scale(attack.range / 2));

    const minX = hitCenter.x - attack.hitbox.width / 2;
    const maxX = hitCenter.x + attack.hitbox.width / 2;
    const minY = hitCenter.y - attack.hitbox.height / 2;
    const maxY = hitCenter.y + attack.hitbox.height / 2;

    const nearbyPlayers = this.room.grid.getObjectsInArea(
      minX,
      maxX,
      minY,
      maxY,
      "player"
    );

    for (const obj of nearbyPlayers) {
      if (
        !obj.alive ||
        obj === owner ||
        this.isAlly(owner, obj) ||
        attack.hitTargets.has(obj.id)
      ) continue;

      // direction cone check (arc)
      const toTarget = new Vec2(
        obj.position.x - origin.x,
        obj.position.y - origin.y
      );

      const dot = dir.x * toTarget.x + dir.y * toTarget.y;
      const magA = Math.hypot(dir.x, dir.y);
      const magB = Math.hypot(toTarget.x, toTarget.y);

      if (magB === 0) continue;

      const angle = Math.acos(dot / (magA * magB)) * (180 / Math.PI);

      if (angle <= attack.arc / 2) {
        // DAMAGE
        owner.HandleSelfBulletsOtherPlayerCollision(
          obj,
          attack.damage,
          attack.weaponId,
          this.room
        );

        // AFFLICTION
        if (attack.afflictionConfig) {
          const a = attack.afflictionConfig;
          this.room.activeAfflictions.push({
            shootingPlayer: owner,
            target: obj,
            target_type: "player",
            damage: a.damage,
            speed: a.waitTime,
            gunid: attack.weaponId,
            nextTick: Date.now() + a.waitTime,
            expires: Date.now() + a.activeTime,
          });
        }

        attack.hitTargets.add(obj.id);
      }
    }
  }

  isAlly(owner, other) {
    if (!owner || !other) return false;
    if (owner.id === other.id) return false;
    if (!this.room.IsTeamMode) return false;
    return owner.team.id === other.team.id;
  }
}

/* =========================
   MELEE FIRE HANDLER
========================= */
function handleMeleeAttack(room, player, meleeConfig) {
  const now = Date.now();

  if (player.shooting || now - (player.lastMeleeTime || 0) < meleeConfig.cooldown)
    return;

  player.shooting = true;
  player.lastMeleeTime = now;

  room.meleeManager.spawnMelee(player, {
    weaponId: meleeConfig.id,
    damage: meleeConfig.damage,
    range: meleeConfig.range,
    arc: meleeConfig.arc,
    duration: meleeConfig.duration,
    hitbox: meleeConfig.hitbox,
    afflictionConfig: meleeConfig.afflictionConfig || false,
  });

  room.setRoomTimeout(() => {
    player.shooting = false;
  }, meleeConfig.cooldown);
}

module.exports = {
  MeleeManager,
  handleMeleeAttack,
  Vec2,
};