"use strict";

const { isCollisionWithCachedWalls } = require('./collisions');
const { respawnplayer } = require('./../playerhandler/respawn')
const { addKillToKillfeed } = require('./killfeed.js')
const { TeamPlayersActive } = require('./../teamhandler/aliveteam')
const { spawnAnimation } = require('./../gameObjectEvents/deathrespawn')
const { handleElimination } = require('../playerhandler/eliminated');
const { updateTeamScore } = require('./../teamfighthandler/changescore')
const { playerhitbox } = require('./config.js')


function handleMovement(player, room) { // all hitbox should be more then the other function in collsision

  const xMin = player.x - (playerhitbox.xMin + 2);
  const xMax = player.x + (playerhitbox.xMax + 2);
  const yMin = player.y - (playerhitbox.yMin + 2);
  const yMax = player.y + (playerhitbox.yMax + 2)

  player.nearbywalls = room.grid.getObjectsInArea(xMin, xMax, yMin, yMax);
  // Calculate radians for final direction
  const finalDirection = player.moving ? player.direction - 90 : player.direction;

  const radians = (finalDirection * Math.PI) / 180;
  // Calculate movement deltas
  const xDelta = player.speed * Math.cos(radians);
  const yDelta = player.speed * Math.sin(radians);
  // Update position with precise values
  let newX = player.x + xDelta;
  let newY = player.y + yDelta;
  // Perform collision checks
  if (isCollisionWithCachedWalls(player.nearbywalls, newX, newY)) {
    const canMoveX = !isCollisionWithCachedWalls(player.nearbywalls, newX, player.y);
    const canMoveY = !isCollisionWithCachedWalls(player.nearbywalls, player.x, newY);

    // Resolve collision by moving along one axis
    if (canMoveX) newY = player.y;
    else if (canMoveY) newX = player.x;
    else {
      newX = player.x;
      newY = player.y;
    }
  }
  // Constrain new position within map bounds
  newX = Math.min(Math.max(newX, -room.mapWidth), room.mapWidth);
  newY = Math.min(Math.max(newY, -room.mapHeight), room.mapHeight);
  // Apply new position and store last processed position
  player.x = parseFloat(newX.toFixed(4)); // Store precise position
  player.y = parseFloat(newY.toFixed(4));
}





function handlePlayerCollision(room, shootingPlayer, targetPlayer, damage, gunid) {
  // Ensure damage doesn't exceed the target player's remaining health
  const GUN_BULLET_DAMAGE = Math.min(damage, targetPlayer.health);

  // Apply damage to the target player and update shooting player's total damage
  targetPlayer.health -= GUN_BULLET_DAMAGE;
  shootingPlayer.damage += GUN_BULLET_DAMAGE;
  targetPlayer.last_hit_time = new Date().getTime();

  const hit = `${targetPlayer.x}:${targetPlayer.y}:${GUN_BULLET_DAMAGE}`

  shootingPlayer.hitmarkers.push(hit)

  // Get the number of active players in the target player's team
  const teamActivePlayers = TeamPlayersActive(room, targetPlayer);

  if (targetPlayer.health <= 0 && targetPlayer.respawns <= 0 && teamActivePlayers <= 1) {

    const elimType = 2; // Type 2 for complete elimination
    const ElimMessage = `${targetPlayer.nmb}:${elimType}`;
    shootingPlayer.eliminations.push(ElimMessage)

    handleElimination(room, targetPlayer.team.players);
    addKillToKillfeed(room, 1, shootingPlayer.nmb, targetPlayer.nmb, gunid)
    spawnAnimation(room, targetPlayer, "death");
    targetPlayer.eliminator = shootingPlayer.nmb;
    targetPlayer.spectatingTarget = shootingPlayer.playerId;
    shootingPlayer.kills += 1;

  } else if (targetPlayer.health < 1 && targetPlayer.respawns > 0) {

    const elimType = 1; // Type 1 for respawnable elimination
    const ElimMessage = `${targetPlayer.nmb}:${elimType}`;
    shootingPlayer.eliminations.push(ElimMessage)

    targetPlayer.visible = false;
    respawnplayer(room, targetPlayer);
    addKillToKillfeed(room, 2, shootingPlayer.nmb, targetPlayer.nmb, gunid)

    if (room.matchtype === "td") {
      updateTeamScore(room, shootingPlayer, 1)

    }
    spawnAnimation(room, targetPlayer, "respawn"); // Show respawn animation
  }
}



function handleDummyCollision(room, shootingPlayer, dummyKey, damage) {

  const dummy = room.dummies[dummyKey];

  if (!dummy) {
    console.error(`Dummy with key ${dummyKey} not found.`);
    return;
  }


  const GUN_BULLET_DAMAGE = Math.min(damage, dummy.health);

  dummy.health -= GUN_BULLET_DAMAGE;

  const hit = `${dummy.x}:${dummy.y}:${GUN_BULLET_DAMAGE}`

  shootingPlayer.hitmarkers.push(hit);

  if (dummy.health < 1) {
    spawnAnimation(room, dummy, "death")

    delete room.dummies[dummyKey];


    room.timeoutIds.push(setTimeout(() => {
      if (room) {
        respawnDummy(room, dummyKey, dummy, shootingPlayer);

      }
    }, 4000));
  }
}


function respawnDummy(room, dummyKey, dummy, player) {

  if (room) {

    const originalDummy = {
      ...dummy
    };

    originalDummy.health = dummy.starthealth

    if (room) {
      room.dummies[dummyKey] = originalDummy;
    }
  }
}





module.exports = {
  handleMovement,
  handlePlayerCollision,
  handleDummyCollision,
}