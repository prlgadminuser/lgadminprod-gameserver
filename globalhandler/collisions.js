"use strict";

const wallblocksize = 50

const halfBlockSize = wallblocksize / 2;
const { playerhitbox } = require('./config.js')

function isCollisionWithWalls(grid, x, y) {
  const xMin = x - 20;
  const xMax = x + 20;
  const yMin = y - 45;
  const yMax = y + 45

  const nearbyWalls = grid.getWallsInArea(xMin, xMax, yMin, yMax);

  for (const wall of nearbyWalls) {
    const wallLeft = wall.x - halfBlockSize;
    const wallRight = wall.x + halfBlockSize;
    const wallTop = wall.y - halfBlockSize;
    const wallBottom = wall.y + halfBlockSize;

    if (
      xMax > wallLeft &&
      xMin < wallRight &&
      yMax > wallTop &&
      yMin < wallBottom
    ) {
      return true; // Collision detected
    }
  }

  return false; // No collision detected
}

function isCollisionWithCachedWalls(walls, x, y) {

  const xMin = x - playerhitbox.xMin;
  const xMax = x + playerhitbox.xMax;
  const yMin = y - playerhitbox.yMin;
  const yMax = y + playerhitbox.yMax;

  const nearbyWalls = walls

  for (const wall of nearbyWalls) {
    const wallLeft = wall.x - halfBlockSize;
    const wallRight = wall.x + halfBlockSize;
    const wallTop = wall.y - halfBlockSize;
    const wallBottom = wall.y + halfBlockSize;

    if (
      xMax > wallLeft &&
      xMin < wallRight &&
      yMax > wallTop &&
      yMin < wallBottom
    ) {
      return true; // Collision detected
    }
  }

  return false; // No collision detected
}
  

function isCollisionWithBullet(grid, x, y, height, width) {

  const xMin = x - width;
  const xMax = x + width;
  const yMin = y - height;
  const yMax = y + width;
  const halfWidth = width;
  const halfHeight = height;

  const nearbyWalls = grid.getWallsInArea(xMin, xMax, yMin, yMax);

  // Iterate through each wall
  for (const wall of nearbyWalls) {
    // Determine the boundaries of the wall
    const wallLeft = wall.x - halfBlockSize;
    const wallRight = wall.x + halfBlockSize;
    const wallTop = wall.y - halfBlockSize;
    const wallBottom = wall.y + halfBlockSize;

    // Check if the bullet's bounding box intersects with the wall's bounding box
    if (
      x - halfWidth < wallRight &&
      x + halfWidth > wallLeft &&
      y - halfHeight < wallBottom &&
      y + halfHeight > wallTop
    ) {
      return true; // Collision detected
    }
  }
  return false; // No collision detected
}


function findCollidedWall(grid, x, y, height, width) {
  const xMin = x - width;
  const xMax = x + width;
  const yMin = y - height;
  const yMax = y + height;

  const nearbyWalls = grid.getWallsInArea(xMin, xMax, yMin, yMax);

  const halfWidth = halfBlockSize;
  const halfHeight = halfBlockSize;
  return nearbyWalls.find((wall) => {


    const wallLeft = wall.x - halfWidth;
    const wallRight = wall.x + halfWidth;
    const wallTop = wall.y - halfHeight;
    const wallBottom = wall.y + halfHeight;

    return (
      xMax > wallLeft &&
      xMin < wallRight &&
      yMax > wallTop &&
      yMin < wallBottom
    );
  });
}

function toRadians(degrees) {
  return degrees * (Math.PI / 180);
}

function adjustBulletDirection(bullet, wall, wallBlockSize) {
  const halfBlockSize = wallBlockSize / 2;

  // Calculate differences between bullet and wall center
  const deltaX = bullet.x - wall.x;
  const deltaY = bullet.y - wall.y;

  let normalAngle;

  // Determine side of collision
  if (Math.abs(deltaX) > Math.abs(deltaY)) {
    if (deltaX < 0) {
      normalAngle = 180; // Left side
    } else {
      normalAngle = 0;   // Right side
    }
  } else {
    if (deltaY < 0) {
      normalAngle = 90;  // Top side
    } else {
      normalAngle = 270; // Bottom side
    }
  }

  // Adjust for exact boundary hits
  const onBoundaryX = Math.abs(deltaX) === halfBlockSize;
  const onBoundaryY = Math.abs(deltaY) === halfBlockSize;

  if (onBoundaryX && onBoundaryY) {
    // If on both boundaries (corner), prioritize the closest side or default
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      normalAngle = deltaX < 0 ? 180 : 0;
    } else {
      normalAngle = deltaY < 0 ? 90 : 270;
    }
  }

  // Convert to radians
  const incomingAngle = toRadians(bullet.direction);
  const normalAngleRadians = toRadians(normalAngle);

  // Reflect the angle
  const reflectionAngleRadians = 2 * normalAngleRadians - incomingAngle;

  // Convert back to degrees and normalize
  let reflectionAngleDegrees = (reflectionAngleRadians * 180) / Math.PI;
  reflectionAngleDegrees = (reflectionAngleDegrees + 360) % 360;

  // Update bullet direction
  bullet.direction = reflectionAngleDegrees;
}


module.exports = {
  isCollisionWithWalls,
  isCollisionWithBullet,
  isCollisionWithCachedWalls,
  wallblocksize,
  adjustBulletDirection,
  findCollidedWall,
};
