"use strict";

const { isCollisionWithBullet, adjustBulletDirection, findCollidedWall, isCollisionWithPlayer } = require('./collisions');
const { handlePlayerCollision, handleDummyCollision } = require('./player');
const { gunsconfig, server_tick_rate } = require('./config');
const { compressMessage } = require('./..//index.js');
const { AddAffliction } = require('./bullets-effects')
const BULLET_MOVE_INTERVAL = server_tick_rate // milliseconds

// Helper functions
const calculateDistance = (x1, y1, x2, y2) => Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
const toRadians = degrees => degrees * (Math.PI / 180);


function GunHasModifier(name, room, modifiers) {
  if (modifiers.has(name) || room.weapons_modifiers_override.has(name)) {
    return true
  } else {
    return false
  }
}

function moveBullet(room, player, bullet) {
  if (!bullet || !room) return;

  const { speed, direction, bullet_id, height, width, maxtime, distance, damageconfig, damage, gunid, modifiers, spinning_speed } = bullet;

  const radians = toRadians(direction - 90);
  const xDelta = speed * Math.cos(radians);
  const yDelta = speed * Math.sin(radians);

  const newX = parseFloat((bullet.x + xDelta).toFixed(1));
  const newY = parseFloat((bullet.y + yDelta).toFixed(1));
  const distanceTraveled = calculateDistance(bullet.startX, bullet.startY, newX, newY);
  const timenow = Date.now();

  // if (GunHasModifier("Spinning", room, modifiers) && spinning_speed) {  
 //   bullet.direction += spinning_speed
   // } 

  if (distanceTraveled > distance || timenow > maxtime) {
    DeleteBullet(player, bullet_id, room, bullet)
    return;
  }


  // Handle collision with the grid first to simplify logic below
  if (isCollisionWithBullet(room.grid, newX, newY, height, width, direction - 90)) {
    const collidedWall = findCollidedWall(room.grid, newX, newY, height, width);
    if (GunHasModifier("DestroyWalls", room, modifiers)) {
      if (collidedWall) DestroyWall(collidedWall, room);
    } else if (GunHasModifier("DestroyWalls(DestroyBullet)", room, modifiers)) {
      if (collidedWall) {
        DeleteBullet(player, bullet_id, room, bullet)
        DestroyWall(collidedWall, room);
        return;
      }
    } else if (GunHasModifier("CanBounce", room, modifiers) && collidedWall) {
      adjustBulletDirection(bullet, collidedWall, 50);
      return;
    } else {
      DeleteBullet(player, bullet_id, room, bullet)
      return;
    }
  }

  // Handle player collision if applicable
  if (room.config.canCollideWithPlayers && room.winner === -1) {
    const potentialTargets = Array.from(room.players.values()).filter(otherPlayer =>
      otherPlayer !== player && otherPlayer.visible && !player.team.players.some(p => p.nmb === otherPlayer.nmb)
    );

    for (const otherPlayer of potentialTargets) {
      if (isCollisionWithPlayer(bullet, otherPlayer, height, width, direction - 90)) {
        const finalDamage = calculateFinalDamage(distanceTraveled, distance, damage, damageconfig);
        handlePlayerCollision(room, player, otherPlayer, finalDamage, gunid);

        const data = {
          target_type: "player",
          damage: 1,
          speed: 500,
          duration: 3000,
          gunid: gunid,
        }

        AddAffliction(room, player, otherPlayer, data)
       
        DeleteBullet(player, bullet_id, room, bullet)
        return;
      }
    }
  }

  // Handle dummy collision if applicable
  if (room.config.canCollideWithDummies) {
    for (const key in room.dummies) {
      const dummy = room.dummies[key];
      if (isCollisionWithPlayer(bullet, dummy, height, width, direction - 90)) {
        const finalDamage = calculateFinalDamage(distanceTraveled, distance, damage, damageconfig);

        handleDummyCollision(room, player, key, finalDamage);

         const data = {
          target_type: "dummy",
          damage: 1,
          speed: 500,
          duration: 3000,
          gunid: gunid,
          dummykey: key,
        }

        AddAffliction(room, player, dummy, data)
       
        DeleteBullet(player, bullet_id, room, bullet)
        return;  
      }
    }
  }

  // Update bullet position if no collision
  bullet.x = newX;
  bullet.y = newY;
}


function DestroyWall(wall, room) {

  room.grid.removeWallAt(wall.x, wall.y);

  const Message = `${wall.x}:${wall.y}`

  room.destroyedWalls.push(Message)


}

function DeleteBullet(player, bullet_id, room) {

   
  player.bullets.delete(bullet_id);




  const Message = `DEL:${bullet_id}`
  
  room.bulletsUpdates.push(Message)

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
  const { angle, offset, damage, speed, height, width, maxtime, distance, damageconfig, gunid, modifiers, spinning_speed } = bulletdata;
  const radians = toRadians(angle);
  const radians1 = toRadians(angle - 90);
  const xOffset = offset * Math.cos(radians);
  const yOffset = offset * Math.sin(radians);
  const bullet_id = Math.random().toString(36).substring(2, 7);

  const x1 = parseFloat((30 * Math.cos(radians1)).toFixed(1)); // Offset along the x-axis
  const y1 = parseFloat((30 * Math.sin(radians1)).toFixed(1)); // Offset along the y-axis

  const bullet = {
    x: player.x + xOffset + x1,
    y: player.y + yOffset + y1,
    startX: player.x + xOffset + x1,
    startY: player.y + yOffset + y1,
    direction: angle,
    owner: player.playerId,
    bullet_id: bullet_id,
    damage,
    speed,
    height,
    width, // Initialize with the number of bounces allowed
    maxtime,
    distance,
    damageconfig,
    gunid,
    modifiers,
    spinning_speed,
  };


  const pos = { x: parseFloat(bullet.x.toFixed(4)), y: parseFloat(bullet.y.toFixed(4))}

  player.bullets.set(bullet_id, bullet);
  const Message = `${bullet_id}:${pos.x}:${pos.y}:${bullet.direction}:${bullet.speed}:${bullet.gunid}`
  room.bulletsUpdates.push(Message)

  while (player.bullets.has(bullet_id)) {
    moveBullet(room, player, bullet);
    if (!player.bullets.has(bullet_id)) break;
    await new Promise(resolve => player.timeoutIds.push(setTimeout(resolve, BULLET_MOVE_INTERVAL)));
  }
}

// Handle Bullet Fired
async function handleBulletFired(room, player, gunType) {
  const gun = gunsconfig.get(gunType);
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
      height: gun.height / 2.5,
      width: gun.width / 2.5,
      maxtime: Date.now() + gun.maxexistingtime + bullet.delay,
      distance: gun.distance,
      damageconfig: gun.damageconfig || {},
      gunid: gunType,
      modifiers: gun.modifiers,
      spinning_speed: gun.spinning_speed || undefined
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