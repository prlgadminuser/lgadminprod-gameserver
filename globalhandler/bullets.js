"use strict";

const { isCollisionWithBullet, adjustBulletDirection, findCollidedWall } = require('./collisions');
const { handlePlayerCollision, handleDummyCollision } = require('./player');
const { playerHitboxHeight, playerHitboxWidth, gunsconfig, server_tick_rate, globalspeedmultiplier } = require('./config');
const { compressMessage } = require('./..//index.js');

const BULLET_MOVE_INTERVAL = server_tick_rate // milliseconds

// Helper functions
const calculateDistance = (x1, y1, x2, y2) => Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
const toRadians = degrees => degrees * (Math.PI / 180);


const playerHalfWidth = playerHitboxWidth / 2.4;
const playerHalfHeight = playerHitboxHeight / 2.4;
// Collision Detection
function isCollisionWithPlayer(bullet, player, bulletHeight, bulletWidth, bulletAngle) { 

  // Get bullet's center position
  let bulletCenterX = bullet.x;
  let bulletCenterY = bullet.y;

  // Calculate the rotated corners of the bullet
  let halfWidth = bulletWidth;
  let halfHeight = bulletHeight;

  let cosA = Math.cos(bulletAngle);
  let sinA = Math.sin(bulletAngle);

  let corners = [
      { x: bulletCenterX + halfWidth * cosA - halfHeight * sinA, y: bulletCenterY + halfWidth * sinA + halfHeight * cosA },
      { x: bulletCenterX - halfWidth * cosA - halfHeight * sinA, y: bulletCenterY - halfWidth * sinA + halfHeight * cosA },
      { x: bulletCenterX - halfWidth * cosA + halfHeight * sinA, y: bulletCenterY - halfWidth * sinA - halfHeight * cosA },
      { x: bulletCenterX + halfWidth * cosA + halfHeight * sinA, y: bulletCenterY + halfWidth * sinA - halfHeight * cosA }
  ];

  // Check if any bullet corner is inside the player's bounding box
  for (let corner of corners) {
      if (
          corner.x >= player.x - playerHalfWidth &&
          corner.x <= player.x + playerHalfWidth &&
          corner.y >= player.y - playerHalfHeight &&
          corner.y <= player.y + playerHalfHeight
      ) {
          return true; // Collision detected
      }
  }

  return false; // No collision
}

function isHeadHit(bullet, player, height, width) {
  const headshotTop = player.y - playerHitboxHeight / 3; 
  const headshotBottom = player.y - playerHitboxHeight / 6; 

  const playerLeft = player.x - playerHitboxWidth / 2.4;
  const playerRight = player.x + playerHitboxWidth / 2.4;

  const bulletLeft = bullet.x - width / 2;
  const bulletRight = bullet.x + width / 2;
  const bulletTop = bullet.y - height / 2;
  const bulletBottom = bullet.y + height / 2;

  const isHeadshot = (
    bulletBottom <= headshotBottom &&
    bulletTop >= headshotTop &&
    bulletRight >= playerLeft &&
    bulletLeft <= playerRight
  );

  return isHeadshot;
}

function moveBullet(room, player, bullet) {
  if (!bullet || !room) return;

  const { speed, direction, timestamp, height, width, bouncesLeft, maxtime, distance, canbounce, damageconfig, damage, gunid } = bullet;

  const radians = toRadians(direction - 90); 
  const xDelta = speed * Math.cos(radians);
  const yDelta = speed * Math.sin(radians);

  const newX = parseFloat((bullet.x + xDelta).toFixed(1));
  const newY = parseFloat((bullet.y + yDelta).toFixed(1));
  const distanceTraveled = calculateDistance(bullet.startX, bullet.startY, newX, newY);

  const timenow = Date.now();
  //console.log(t1, bullet.maxtime);

  if (distanceTraveled > distance || timenow > maxtime) {
    player.bullets.delete(timestamp);
    return;

  }


  if (!isCollisionWithBullet(room.grid, newX, newY, height, width)) {
    bullet.x = newX;
    bullet.y = newY;


    if (room.config.canCollideWithPlayers && room.winner === -1) {


      const potentialTargets = Array.from(room.players.values()).filter(otherPlayer =>
        otherPlayer !== player &&
        otherPlayer.visible &&    
        !player.team.players.some(player => player.nmb === otherPlayer.nmb)
      );

      for (const otherPlayer of potentialTargets) {
        if (isCollisionWithPlayer(bullet, otherPlayer, height, width, direction)) {
          let finalDamage

          finalDamage = calculateFinalDamage(distanceTraveled, distance, damage, damageconfig);

          handlePlayerCollision(room, player, otherPlayer, finalDamage, gunid);
          player.bullets.delete(timestamp);
          return;
        }
      }
    }

  if (room.config.canCollideWithDummies) {
    for (const key in room.dummies) {
      if (room.dummies.hasOwnProperty(key)) {
        const dummy = room.dummies[key];
        
        if (isCollisionWithPlayer(bullet, dummy, height, width, direction)) { // Reuse the same collision function
          // Handle the dummy collision

          let finalDamage

          finalDamage = calculateFinalDamage(distanceTraveled, distance, damage, damageconfig);
          //if (isHeadHit(bullet, dummy, height, width)) {
        //    finalDamage = calculateFinalDamage(distanceTraveled, distance, damage * 1.7, damageconfig);
         // } else {
         //   finalDamage = calculateFinalDamage(distanceTraveled, distance, damage, damageconfig);
  
         // }
        
          handleDummyCollision(room, player, key, finalDamage); // Pass key instead of dummy object
          
          // Remove the bullet from the player's bullets
          player.bullets.delete(timestamp);
          
          // Exit the loop after handling the collision
          return;
        }
      }
    }
  }

  } else {
    // Check if the bullet can bounce
    const collidedWall = findCollidedWall(room.grid, newX, newY, height, width);

    console.log(collidedWall, Math.random(1))

    if (canbounce === true) { // Find the wall the bullet collided with
      if (collidedWall) {
        adjustBulletDirection(bullet, collidedWall, 50);
       // bullet.bouncesLeft = bouncesLeft - 1; // Decrease bouncesLeft
      }
    } else {
      if (collidedWall) {

      player.bullets.delete(timestamp); // Remove the bullet if no bounces are left
      room.grid.removeWallAt(collidedWall.x, collidedWall.y)
      SendRemovedWallToPlayers(collidedWall, room)
      } else {

        return;
      }
    }
  }
}

function SendRemovedWallToPlayers(wall, room) {
  room.players.forEach(player => {

    const MessageToSend = `WLD:${wall.x}:${wall.y}`

    const compressedPlayerMessage = compressMessage(MessageToSend)
    player.ws.send(compressedPlayerMessage, { binary: true })

  })
}


// Bullet Shooting with Delay
function shootBulletsWithDelay(room, player, bulletdata) {
  return new Promise(resolve => {
    player.timeoutIds.push(setTimeout(async () => {
      await shootBullet(room, player, bulletdata);
      resolve();
    }, bulletdata.delay));
  });
}

// Shoot Bullet
async function shootBullet(room, player, bulletdata) {
  const { angle, offset, damage, speed, height, width, bouncesLeft, maxtime, distance, canbounce, damageconfig, gunid } = bulletdata;
  const radians = toRadians(angle);
  const radians1 = toRadians(angle - 90);
  const xOffset = offset * Math.cos(radians);
  const yOffset = offset * Math.sin(radians);
  const timestamp = Math.random().toString(36).substring(2, 7);

  const x1 = parseFloat((30 * Math.cos(radians1)).toFixed(1)); // Offset along the x-axis
const y1 = parseFloat((30 * Math.sin(radians1)).toFixed(1)); // Offset along the y-axis

  const bullet = {
    x: player.x + xOffset + x1,
    y: player.y + yOffset + y1,
    startX: player.x + xOffset + x1,
    startY: player.y + yOffset + y1,
    direction: angle,
    timestamp,
    damage,
    speed,
    height,
    width,
    bouncesLeft, // Initialize with the number of bounces allowed
    maxtime,
    distance,
    canbounce,
    damageconfig,
    gunid,
  };

  player.bullets.set(timestamp, bullet);

  while (player.bullets.has(timestamp)) {
    moveBullet(room, player, bullet);
    if (!player.bullets.has(timestamp)) break;
    await new Promise(resolve =>   player.timeoutIds.push(setTimeout(resolve, BULLET_MOVE_INTERVAL)));
  }
}

// Handle Bullet Fired
async function handleBulletFired(room, player, gunType) {
  const gun = gunsconfig[gunType];
  const currentTime = Date.now();
  const lastShootTime = player.lastShootTime || 0;
  const shootCooldown = gun.cooldown;

  if (player.shooting || (currentTime - lastShootTime < shootCooldown)) {
    return;
  }

  player.shooting = true;
  player.lastShootTime = currentTime;

  const definedAngle = gun.useplayerangle ? player.shoot_direction : 0;

  for (const bullet of gun.bullets) {

    const bulletdata = {
      speed: bullet.speed / 2,
      delay: bullet.delay,
      offset: bullet.offset,
      damage: gun.damage,
      angle: gun.useplayerangle ? bullet.angle + definedAngle : bullet.angle,
      height: 4,
      width: 4,
      bouncesLeft: gun.maxbounces || 0, // Set initial bounces
      maxtime: Date.now() + gun.maxexistingtime + bullet.delay,
      distance: gun.distance,
      canbounce: gun.can_bullets_bounce, 
      damageconfig: gun.damageconfig || {},
      gunid: gunType
    };

    shootBulletsWithDelay(room, player, bulletdata);
  }

  player.timeoutIds.push(setTimeout(() => {
    player.shooting = false;
  }, shootCooldown));
}

function calculateFinalDamage(distanceUsed, bulletMaxDistance, normalDamage, layers) {

  if (!Array.isArray(layers) || layers.length === 0) {
    return normalDamage;
}

  for (const layer of layers) {
      const thresholdDistance = (layer.threshold / 100) * bulletMaxDistance;
      if (distanceUsed <= thresholdDistance) {
          return Math.ceil(normalDamage * layer.damageMultiplier);
      }
  }
  return 0; // No damage if no condition is met
}


module.exports = {
  handleBulletFired,
};