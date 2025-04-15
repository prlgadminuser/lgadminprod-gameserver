"use strict";

const { isCollisionWithCachedWalls } = require('./collisions');
const { respawnplayer } = require('./../playerhandler/respawn')
const { addKillToKillfeed } = require('./killfeed.js')
const { TeamPlayersActive } = require('./../teamhandler/aliveteam')
const { spawnAnimation } = require('./../gameObjectEvents/deathrespawn')
const { handleElimination } = require('../playerhandler/eliminated');
const { updateTeamScore } = require('./../teamfighthandler/changescore')
const { findCollidedWall } = require('./collisions');
const { playerhitbox } = require('./config.js')



function getDistance(x1, y1, x2, y2) {
  return Math.sqrt((x1 - x2) * (x1 - x2) + (y1 - y2) * (y1 - y2));
}

function handleMovement(player, room) { // all hitbox should be more then the other function in collsision

  const deltaTime = 1; // Fixed time step in ms

  const xMin = player.x - (playerhitbox.xMin + 2);  
  const xMax = player.x + (playerhitbox.xMax + 2);
  const yMin = player.y - (playerhitbox.yMin + 2);
  const yMax = player.y + (playerhitbox.yMax + 2)

  player.nearbywalls = room.grid.getWallsInArea(xMin, xMax, yMin, yMax);

  // Calculate radians for final direction
  const finalDirection = player.moving ? player.direction - 90 : player.direction;

  const radians = (finalDirection * Math.PI) / 180;

  // Calculate movement deltas
  const xDelta = player.speed * deltaTime * Math.cos(radians);
  const yDelta = player.speed * deltaTime * Math.sin(radians);

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
  player.x = parseFloat(newX.toFixed(1)); // Store precise position
  player.y = parseFloat(newY.toFixed(1));
}





function handlePlayerCollision(room, shootingPlayer, targetPlayer, damage, gunid) {
  // Ensure damage doesn't exceed the target player's remaining health
  const GUN_BULLET_DAMAGE = Math.min(damage, targetPlayer.health);

  // Apply damage to the target player and update shooting player's total damage
  targetPlayer.health -= GUN_BULLET_DAMAGE;
  shootingPlayer.damage += GUN_BULLET_DAMAGE;

  // Record the time of the hit for the target player
  targetPlayer.last_hit_time = new Date().getTime();

  // Create hit data to send back to the shooting player
  const hit = [
    targetPlayer.x,
    targetPlayer.y,
    Math.random().toString(36).substring(2, 7), // Random hit ID
    GUN_BULLET_DAMAGE,
  ].join('$');

  shootingPlayer.hitdata = hit;

  // Get the number of active players in the target player's team
  const teamActivePlayers = TeamPlayersActive(room, targetPlayer);

  // If the target player is completely eliminated (health <= 0, no respawns left, and no active teammates)
  if (targetPlayer.health <= 0 && targetPlayer.respawns <= 0 && teamActivePlayers <= 1) {
    const elimType = 2; // Type 2 for complete elimination
    handleElimination(room, targetPlayer.team.players); // Eliminate the team (team.players has player objects)
    addKillToKillfeed(room, 1, shootingPlayer.nmb, targetPlayer.nmb, gunid)
    spawnAnimation(room, targetPlayer, "death"); // Show death animation

    targetPlayer.eliminator = shootingPlayer.nmb; // Track the player who eliminated
    targetPlayer.spectatingTarget = shootingPlayer.playerId; // Make the eliminated player spectate the shooter
    shootingPlayer.elimlast = `${targetPlayer.nmb}$${elimType}`; // Record the elimination details
    shootingPlayer.kills += 1; // Increase kills for the shooter

    // Delay the reset of last elimination data
    room.timeoutIds.push(setTimeout(() => {
      shootingPlayer.elimlast = null;
    }, 100));

  } else if (targetPlayer.health < 1 && targetPlayer.respawns > 0) {
    // If the target player's health is below 1 and they have respawns left
    const elimType = 1; // Type 1 for respawnable elimination
    shootingPlayer.elimlast = `${targetPlayer.nmb}$${elimType}`; // Record the respawn elimination

    // Delay the reset of last elimination data
    room.timeoutIds.push(setTimeout(() => {
      shootingPlayer.elimlast = null;
    }, 100));

    // Hide the target player and trigger respawn
    targetPlayer.visible = false;

    respawnplayer(room, targetPlayer); // Respawn the player
    addKillToKillfeed(room, 2, shootingPlayer.nmb, targetPlayer.nmb, gunid)
    if (room.matchtype === "td"){
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


  const GUN_BULLET_DAMAGE = Math.min(damage, dummy.h);

  dummy.h -= GUN_BULLET_DAMAGE;

  const hit = [
    dummy.x,
    dummy.y,
    Math.random().toString(36).substring(2, 7),
    //new Date().getTime(),
    GUN_BULLET_DAMAGE,
  ].join('$');


  shootingPlayer.hitdata = hit;

  if (dummy.h < 1) {
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

    originalDummy.h = dummy.sh

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