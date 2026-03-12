const { playerhitbox } = require("../config/player");
const { spawnAnimation } = require("../modifiers/animations");
const { createHitmarker } = require("../utils/game");


class Dummy {
  constructor(room, data) {
    const { health, position } = data;

    this.room = room;

    this.objectType = "bot";

    this.width = playerhitbox.width;
    this.height = playerhitbox.height;

    // store spawn data
    this.startHealth = health;
    this.spawnPosition = { x: position.x, y: position.y };

    this.health = health;

    this.position = {
      x: position.x,
      y: position.y,
    };

    this.alive = true;
    this.dirty = true;

    this.room.grid.addObject(this);
    this.room.aliveDummies.add(this);
  }

  move(position) {
    this.position.x = position.x;
    this.position.y = position.y;

    this.room.grid.updateObject(this);

    this.dirty = true;
  }

  damage(damage, shooter) {
    const applied = Math.min(damage, this.health);

    this.health -= applied;
    this.last_dealtdamage_player = shooter;

    createHitmarker(this, shooter, applied);

    if (this.health < 1) {
      this.die();
    }

    this.dirty = true;
  }

  die() {
    this.alive = false;

    this.room.grid.removeObject(this);
    this.room.aliveDummies.delete(this);

    spawnAnimation(this.room, this, "eliminated");

    this.scheduleRespawn();
  }

  scheduleRespawn() {
    this.room.setRoomTimeout(() => {

      this.respawn();
    }, 4000);
  }

  respawn() {
    this.health = this.startHealth;

    this.position.x = this.spawnPosition.x;
    this.position.y = this.spawnPosition.y;

    this.alive = true;

    this.room.grid.addObject(this);
    this.room.aliveDummies.add(this);

  spawnAnimation(this.room, this, "respawning");

    this.dirty = true;
  }
}

module.exports = Dummy;