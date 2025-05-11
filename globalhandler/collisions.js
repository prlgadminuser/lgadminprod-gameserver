"use strict";

const {
  playerHitboxHeight,
  playerHitboxWidth,
  playerhitbox
} = require('./config');

const wallblocksize = 40;
const halfBlockSize = wallblocksize / 2;

function isCollisionWithWalls(grid, x, y) {
  const xMin = x - 20;
  const xMax = x + 20;
  const yMin = y - 45;
  const yMax = y + 45;

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
      return true;
    }
  }

  return false;
}

function isCollisionWithCachedWalls(walls, x, y) {
  const xMin = x - playerhitbox.xMin;
  const xMax = x + playerhitbox.xMax;
  const yMin = y - playerhitbox.yMin;
  const yMax = y + playerhitbox.yMax;

  for (const wall of walls) {
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
      return true;
    }
  }

  return false;
}

function isHeadHit(bullet, player, height, width) {
  const headshotTop = player.y - playerHitboxHeight / 3;
  const headshotBottom = player.y - playerHitboxHeight / 6;

  const playerLeft = player.x - playerHitboxWidth / 2.4;
  const playerRight = player.x + playerHitboxWidth / 2.4;

  const bulletLeft = bullet.x - width;
  const bulletRight = bullet.x + width;
  const bulletTop = bullet.y - height;
  const bulletBottom = bullet.y + height;

  return (
    bulletBottom <= headshotBottom &&
    bulletTop >= headshotTop &&
    bulletRight >= playerLeft &&
    bulletLeft <= playerRight
  );
}

function rotatePoint(x, y, cx, cy, angleRad) {
  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);
  const dx = x - cx;
  const dy = y - cy;

  return {
    x: cx + dx * cosA - dy * sinA,
    y: cy + dx * sinA + dy * cosA
  };
}

function getBulletCorners(bullet, width, height, angleDeg) {
  const rad = toRadians(angleDeg);
  const hw = width;
  const hh = height;

  return [
    rotatePoint(bullet.x + hw, bullet.y + hh, bullet.x, bullet.y, rad),
    rotatePoint(bullet.x - hw, bullet.y + hh, bullet.x, bullet.y, rad),
    rotatePoint(bullet.x - hw, bullet.y - hh, bullet.x, bullet.y, rad),
    rotatePoint(bullet.x + hw, bullet.y - hh, bullet.x, bullet.y, rad),
  ];
}

function isCollisionWithPlayer(bullet, player, bulletHeight, bulletWidth, bulletAngle) {
  const bulletCorners = getBulletCorners(bullet, bulletWidth, bulletHeight, bulletAngle);
  
  // Define the player's rectangle as 4 points (clockwise)
  const playerHalfWidth = playerHitboxWidth;
  const playerHalfHeight = playerHitboxHeight;
  const playerCorners = [
    { x: player.x - playerHalfWidth, y: player.y - playerHalfHeight },
    { x: player.x + playerHalfWidth, y: player.y - playerHalfHeight },
    { x: player.x + playerHalfWidth, y: player.y + playerHalfHeight },
    { x: player.x - playerHalfWidth, y: player.y + playerHalfHeight }
  ];

  return doPolygonsIntersect(bulletCorners, playerCorners);
}


function isCollisionWithBullet(grid, x, y, height, width, direction) {
  const bulletCorners = getBulletCorners({ x, y }, width, height, direction);

  const xMin = Math.min(...bulletCorners.map(c => c.x));
  const xMax = Math.max(...bulletCorners.map(c => c.x));
  const yMin = Math.min(...bulletCorners.map(c => c.y));
  const yMax = Math.max(...bulletCorners.map(c => c.y));

  const nearbyWalls = grid.getWallsInArea(xMin, xMax, yMin, yMax);

  for (const wall of nearbyWalls) {
    const wallCorners = [
      { x: wall.x - halfBlockSize, y: wall.y - halfBlockSize },
      { x: wall.x + halfBlockSize, y: wall.y - halfBlockSize },
      { x: wall.x + halfBlockSize, y: wall.y + halfBlockSize },
      { x: wall.x - halfBlockSize, y: wall.y + halfBlockSize }
    ];

    if (doPolygonsIntersect(bulletCorners, wallCorners)) {
      return true;
    }
  }

  return false;
}

function findCollidedWall(grid, x, y, height, width) {
  const xMin = x - width;
  const xMax = x + width;
  const yMin = y - height;
  const yMax = y + height;

  const nearbyWalls = grid.getWallsInArea(xMin, xMax, yMin, yMax);

  return nearbyWalls.find((wall) => {
    const wallLeft = wall.x - halfBlockSize;
    const wallRight = wall.x + halfBlockSize;
    const wallTop = wall.y - halfBlockSize;
    const wallBottom = wall.y + halfBlockSize;

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

  const deltaX = bullet.x - wall.x;
  const deltaY = bullet.y - wall.y;

  let normalAngle;

  if (Math.abs(deltaX) > Math.abs(deltaY)) {
    normalAngle = deltaX < 0 ? 180 : 0;
  } else {
    normalAngle = deltaY < 0 ? 90 : 270;
  }

  const incomingAngle = toRadians(bullet.direction);
  const normalAngleRadians = toRadians(normalAngle);
  const reflectionAngleRadians = 2 * normalAngleRadians - incomingAngle;

  let reflectionAngleDegrees = (reflectionAngleRadians * 180) / Math.PI;
  reflectionAngleDegrees = (reflectionAngleDegrees + 360) % 360;

  bullet.direction = reflectionAngleDegrees;
}


function doPolygonsIntersect(a, b) {
  const polygons = [a, b];

  for (let i = 0; i < polygons.length; i++) {
    const polygon = polygons[i];

    for (let j = 0; j < polygon.length; j++) {
      const k = (j + 1) % polygon.length;
      const edge = { x: polygon[k].x - polygon[j].x, y: polygon[k].y - polygon[j].y };

      // Get perpendicular axis to the edge
      const axis = { x: -edge.y, y: edge.x };

      // Project both polygons onto the axis
      let [minA, maxA] = projectPolygon(a, axis);
      let [minB, maxB] = projectPolygon(b, axis);

      // Check for overlap
      if (maxA < minB || maxB < minA) {
        return false; // No collision on this axis
      }
    }
  }

  return true; // All axes overlap
}

function projectPolygon(polygon, axis) {
  let min = dotProduct(polygon[0], axis);
  let max = min;

  for (let i = 1; i < polygon.length; i++) {
    const proj = dotProduct(polygon[i], axis);
    if (proj < min) min = proj;
    if (proj > max) max = proj;
  }

  return [min, max];
}

function dotProduct(point, axis) {
  return point.x * axis.x + point.y * axis.y;
}


module.exports = {
  isCollisionWithWalls,
  isCollisionWithBullet,
  isCollisionWithCachedWalls,
  wallblocksize,
  adjustBulletDirection,
  findCollidedWall,
  isCollisionWithPlayer
};
