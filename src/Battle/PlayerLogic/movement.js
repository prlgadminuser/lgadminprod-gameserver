"use strict";

const { TeamPlayersActive } = require("@main/src/teamhandler/aliveteam");
const { isCollisionWithCachedWalls } = require("../Collisions/collision");
const { handleElimination } = require("./eliminated");
const { respawnplayer } = require("./respawn");
const { addEntryToKillfeed } = require("../GameLogic/killfeed");
const { spawnAnimation } = require("@main/src/gameObjectEvents/animations");
const { updateTeamScore } = require("@main/src/teamfighthandler/changescore");
const { playerhitbox } = require("@main/modules");


  const added_hitbox = 2;
  const hitboxXMin = playerhitbox.xMin + added_hitbox;
  const hitboxXMax = playerhitbox.xMax + added_hitbox;
  const hitboxYMin = playerhitbox.yMin + added_hitbox;
  const hitboxYMax = playerhitbox.yMax + added_hitbox;

 function handleMovement(player, room) {
  const DEG2RAD = Math.PI / 180;

  // Compute direction vector
  if (player.moving) {
    const dirRad = (player.direction - 90) * DEG2RAD;
    player.cos = Math.cos(dirRad);
    player.sin = Math.sin(dirRad);
  }

  const speed = player.speed;
  let moveVec = { x: player.cos * speed, y: player.sin * speed };

  // Clamp movement to remaining distance in case of collisions
  let newX = player.x + moveVec.x;
  let newY = player.y + moveVec.y;

  // Nearby walls for collision
  const xMin = Math.min(player.x, newX) - hitboxXMin;
  const xMax = Math.max(player.x, newX) + hitboxXMax;
  const yMin = Math.min(player.y, newY) - hitboxYMin;
  const yMax = Math.max(player.y, newY) + hitboxYMax;

  const nearbyWalls = room.grid.getObjectsInArea(xMin, xMax, yMin, yMax);
  player.nearbywalls = nearbyWalls;

  // Vector-based sliding
  const maxIterations = 3; // prevent infinite loops
  let remaining = { x: moveVec.x, y: moveVec.y };

  for (let i = 0; i < maxIterations; i++) {
    if (!isCollisionWithCachedWalls(nearbyWalls, player.x + remaining.x, player.y + remaining.y)) {
      newX = player.x + remaining.x;
      newY = player.y + remaining.y;
      break;
    }

    // Try sliding along X
    if (!isCollisionWithCachedWalls(nearbyWalls, player.x + remaining.x, player.y)) {
      newX = player.x + remaining.x;
      remaining.x = 0;
    } 
    // Try sliding along Y
    if (!isCollisionWithCachedWalls(nearbyWalls, player.x, player.y + remaining.y)) {
      newY = player.y + remaining.y;
      remaining.y = 0;
    }

    // If fully blocked, stop movement
    if (remaining.x === 0 && remaining.y === 0) {
      newX = player.x;
      newY = player.y;
      break;
    }

    // Reduce remaining vector to prevent jitter
    remaining.x *= 0.5;
    remaining.y *= 0.5;
  }

  // Clamp within map bounds
  const mapWidth = room.mapWidth;
  const mapHeight = room.mapHeight;
  newX = Math.max(-mapWidth, Math.min(mapWidth, newX));
  newY = Math.max(-mapHeight, Math.min(mapHeight, newY));

  player.x = newX;
  player.y = newY;

  if (player._gridKey) room.realtimegrid.updateObject(player, player.x, player.y);
}




function handlePlayerCollision(room, shootingPlayer, targetPlayer, damage, gunid) {

  const GUN_BULLET_DAMAGE = Math.min(damage, targetPlayer.health);
  targetPlayer.health -= GUN_BULLET_DAMAGE;
  shootingPlayer.damage += GUN_BULLET_DAMAGE;
  targetPlayer.last_hit_time = new Date().getTime();
  targetPlayer.last_hitter = shootingPlayer // Track last player hitter to give him 1 kill if player gets eliminated through zone etc

  const hit = [ Math.round(targetPlayer.x), Math.round(targetPlayer.y), GUN_BULLET_DAMAGE ]

  shootingPlayer.hitmarkers.push(hit)

  const teamActivePlayers = TeamPlayersActive(room, targetPlayer);

  if (targetPlayer.health <= 0 && targetPlayer.respawns <= 0 && teamActivePlayers <= 1) {

    const elimType = 1; // Type 1 for complete elimination
    const ElimMessage = [ elimType, targetPlayer.id ];
    shootingPlayer.eliminations.push(ElimMessage)

    handleElimination(room, targetPlayer);
    addEntryToKillfeed(room, 1, shootingPlayer.id, targetPlayer.id, gunid)
    targetPlayer.eliminator = shootingPlayer.id;
    targetPlayer.spectatingTarget = shootingPlayer;
    shootingPlayer.kills += 1;

  } else if (targetPlayer.health < 1 && targetPlayer.respawns > 0) {

    const elimType = 2; // Type 2 for respawnable elimination
    const ElimMessage = [ elimType, targetPlayer.id ];
    shootingPlayer.eliminations.push(ElimMessage)

    respawnplayer(room, targetPlayer);
    addEntryToKillfeed(room, 2, shootingPlayer.id, targetPlayer.id, gunid)

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

  const hit = [Math.round(dummy.x), Math.round(dummy.y), GUN_BULLET_DAMAGE]

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


function respawnDummy(room, dummyKey, dummy) {

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
  playerhitbox,

}
