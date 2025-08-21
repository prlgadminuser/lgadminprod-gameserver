"use strict";

const { isCollisionWithCachedWalls } = require('./collisions');
const { respawnplayer } = require('./../playerhandler/respawn')
const { addKillToKillfeed } = require('./killfeed.js')
const { TeamPlayersActive } = require('./../teamhandler/aliveteam')
const { spawnAnimation } = require('./../gameObjectEvents/animations')
const { handleElimination } = require('../playerhandler/eliminated');
const { updateTeamScore } = require('./../teamfighthandler/changescore')
const { playerhitbox } = require('./config.js')


  const added_hitbox = 2;
  const hitboxXMin = playerhitbox.xMin + added_hitbox;
  const hitboxXMax = playerhitbox.xMax + added_hitbox;
  const hitboxYMin = playerhitbox.yMin + added_hitbox;
  const hitboxYMax = playerhitbox.yMax + added_hitbox;

 function handleMovement(player, room) {
  // Skip if player is not moving
  //if (!player.moving && player.speed === 0) return;

  const xMin = player.x - hitboxXMin;
  const xMax = player.x + hitboxXMax;
  const yMin = player.y - hitboxYMin;
  const yMax = player.y + hitboxYMax;

  // Only get nearby walls once
  const nearbyWalls = room.grid.getObjectsInArea(xMin, xMax, yMin, yMax);
  player.nearbywalls = nearbyWalls;

  // Calculate movement direction in radians
  const DEG2RAD = Math.PI / 180;
  const finalDirection = (player.moving ? player.direction - 90 : player.direction) * DEG2RAD;
  const cos = Math.cos(finalDirection);
  const sin = Math.sin(finalDirection);

  // Movement deltas
  const speed = player.speed;
  let newX = player.x + speed * cos;
  let newY = player.y + speed * sin;

  // Collision checks only once per axis
  if (isCollisionWithCachedWalls(nearbyWalls, newX, newY)) {
    const canMoveX = !isCollisionWithCachedWalls(nearbyWalls, newX, player.y);
    const canMoveY = !isCollisionWithCachedWalls(nearbyWalls, player.x, newY);

    if (canMoveX) {
      newY = player.y;
    } else if (canMoveY) {
      newX = player.x;
    } else {
      newX = player.x;
      newY = player.y;
    }
  }

  // Clamp within bounds
  const mapWidth = room.mapWidth;
  const mapHeight = room.mapHeight;
  if (newX < -mapWidth) newX = -mapWidth;
  else if (newX > mapWidth) newX = mapWidth;
  if (newY < -mapHeight) newY = -mapHeight;
  else if (newY > mapHeight) newY = mapHeight;

  // Store new position (avoid parseFloat — toFixed is slower than necessary)
  player.x = Math.round(newX * 100) / 100;
  player.y = Math.round(newY * 100) / 100;

  if (player._gridKey) room.realtimegrid.updateObject(player, player.x, player.y);
}



function handlePlayerCollision(room, shootingPlayer, targetPlayer, damage, gunid) {

  const GUN_BULLET_DAMAGE = Math.min(damage, targetPlayer.health);
  targetPlayer.health -= GUN_BULLET_DAMAGE;
  shootingPlayer.damage += GUN_BULLET_DAMAGE;
  targetPlayer.last_hit_time = new Date().getTime();
  targetPlayer.last_hitter = shootingPlayer // Track last player hitter to give him 1 kill if player gets eliminated through zone etc

  const hit = [ targetPlayer.x, targetPlayer.y, GUN_BULLET_DAMAGE ]

  shootingPlayer.hitmarkers.push(hit)

  const teamActivePlayers = TeamPlayersActive(room, targetPlayer);

  if (targetPlayer.health <= 0 && targetPlayer.respawns <= 0 && teamActivePlayers <= 1) {

    const elimType = 1; // Type 1 for complete elimination
    const ElimMessage = [ elimType, targetPlayer.id ];
    shootingPlayer.eliminations.push(ElimMessage)

    handleElimination(room, targetPlayer);
    addKillToKillfeed(room, 1, shootingPlayer.id, targetPlayer.id, gunid)
    targetPlayer.eliminator = shootingPlayer.id;
    targetPlayer.spectatingTarget = shootingPlayer;
    shootingPlayer.kills += 1;

  } else if (targetPlayer.health < 1 && targetPlayer.respawns > 0) {

    const elimType = 2; // Type 2 for respawnable elimination
    const ElimMessage = [ elimType, targetPlayer.id ];
    shootingPlayer.eliminations.push(ElimMessage)

    respawnplayer(room, targetPlayer);
    addKillToKillfeed(room, 2, shootingPlayer.id, targetPlayer.id, gunid)

    if (room.matchtype === "td") {
      updateTeamScore(room, shootingPlayer, 1)

    }
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

  const hit = [dummy.x, dummy.y, GUN_BULLET_DAMAGE]

  shootingPlayer.hitmarkers.push(hit);

  if (dummy.health < 1) {
    spawnAnimation(room, dummy, "eliminated")

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