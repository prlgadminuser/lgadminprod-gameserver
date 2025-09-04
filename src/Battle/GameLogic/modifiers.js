"use strict";

const { TeamPlayersActive } = require("@main/src/teamhandler/aliveteam");
const { respawnplayer } = require("../PlayerLogic/respawn");
const { handleElimination } = require("../PlayerLogic/eliminated");

handleElimination

function damagePlayer(player, room) {
  if (player.health <= 0) return;

  player.last_hit_time = Date.now();
  player.health -= 5;

  if (player.health > 0) return;

  const active = TeamPlayersActive(room, player);
  (player.respawns > 0 || active > 1)
    ? respawnplayer(room, player)
    : handleElimination(room, player);
}

function regenPlayer(player, now) {
  if (
    player.health > 0 &&
    player.health < player.starthealth &&
    now - player.last_hit_time >= 10000
  ) {
    player.health = Math.min(player.health + 6, player.starthealth);
  }
}

function forEachAlive(room, fn) {
  room.players.forEach(p => p.alive !== false && fn(p));
}

function decreaseHealth(room) {
  if (room.state === "playing" && room.winner === -1) {
    forEachAlive(room, p => damagePlayer(p, room));
  }
}

function regenerateHealth(room) {
  if (room.state === "playing") {
    const now = Date.now();
    forEachAlive(room, p => regenPlayer(p, now));
  }
}

function startDecreasingHealth(room, seconds) {
  room.intervalIds.push(setInterval(() => decreaseHealth(room), seconds * 1000));
}

function startRegeneratingHealth(room, seconds) {
  room.intervalIds.push(setInterval(() => regenerateHealth(room), seconds * 1000));
}

module.exports = { startDecreasingHealth, startRegeneratingHealth };
