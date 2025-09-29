"use strict";

const { playerhitbox } = require("@main/modules");

const wallblocksize = 40;
const halfBlockSize = wallblocksize / 2;


const playerHalfWidth = playerhitbox.width
const playerHalfHeight = playerhitbox.height


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

    if (xMax > wallLeft && xMin < wallRight & yMax > wallTop && yMin < wallBottom) {
      return true
    }
  }

  return false;
}


function isHeadHit(bullet, player, height, width) {
  const headshotTop = player.y - playerhitbox.width / 3;
  const headshotBottom = player.y - playerhitbox.height / 6;

  const playerLeft = player.x - playerhitbox.width / 2.4;
  const playerRight = player.x + playerhitbox.width / 2.4;

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
    y: cy + dx * sinA + dy * cosA,
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

function isCollisionWithPlayer(
  bullet,
  player,
  bulletHeight,
  bulletWidth,
  bulletAngle
) {
  const bulletCorners = getBulletCorners(
    bullet,
    bulletWidth,
    bulletHeight,
    bulletAngle
  );

  // Define the player's rectangle
  const playerCorners = [
    { x: player.x - playerHalfWidth, y: player.y - playerHalfHeight },
    { x: player.x + playerHalfWidth, y: player.y - playerHalfHeight },
    { x: player.x + playerHalfWidth, y: player.y + playerHalfHeight },
    { x: player.x - playerHalfWidth, y: player.y + playerHalfHeight },
  ];

  return doPolygonsIntersect(bulletCorners, playerCorners);
}

function getCollidedWallsWithBullet(grid, x, y, height, width, direction) {
  const bulletCorners = getBulletCorners({ x, y }, width, height, direction);

  const xMin = Math.min(...bulletCorners.map((c) => c.x));
  const xMax = Math.max(...bulletCorners.map((c) => c.x));
  const yMin = Math.min(...bulletCorners.map((c) => c.y));
  const yMax = Math.max(...bulletCorners.map((c) => c.y));

  const nearbyWalls = grid.getObjectsInArea(xMin, xMax, yMin, yMax, "wall");

  const collidedWalls = [];

  for (const wall of nearbyWalls) {
    const wallCorners = [
      { x: wall.x - halfBlockSize, y: wall.y - halfBlockSize },
      { x: wall.x + halfBlockSize, y: wall.y - halfBlockSize },
      { x: wall.x + halfBlockSize, y: wall.y + halfBlockSize },
      { x: wall.x - halfBlockSize, y: wall.y + halfBlockSize },
    ];

    if (doPolygonsIntersect(bulletCorners, wallCorners)) {
      collidedWalls.push(wall);
    }
  }

  return collidedWalls;
}


function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function doPolygonsIntersect(a, b) {
  const polygons = [a, b];

  for (const polygon of polygons) {
    for (let i = 0; i < polygon.length; i++) {
      const p1 = polygon[i];
      const p2 = polygon[(i + 1) % polygon.length];

      // Perpendicular axis to the edge
      const axis = { x: -(p2.y - p1.y), y: p2.x - p1.x };

      const [minA, maxA] = projectPolygon(a, axis);
      const [minB, maxB] = projectPolygon(b, axis);

      if (maxA < minB || maxB < minA) {
        return false;
      }
    }
  }

  return true;
}

function projectPolygon(polygon, axis) {
  let min = Infinity;
  let max = -Infinity;

  for (const point of polygon) {
    const projection = point.x * axis.x + point.y * axis.y;
    min = Math.min(min, projection);
    max = Math.max(max, projection);
  }

  return [min, max];
}


module.exports = {
  getCollidedWallsWithBullet,
  isCollisionWithCachedWalls,
  wallblocksize,
  isCollisionWithPlayer,
  getBulletCorners
};