"use strict";

const { playerhitbox } = require("../config/player");
const { rectCircleIntersection, rectRectIntersection } = require("../utils/math");

const playerHalfWidth = playerhitbox.width
const playerHalfHeight = playerhitbox.height


function isCollisionWithCachedWalls(walls, x, y) {
  const xMin = x - playerhitbox.xMin;
  const xMax = x + playerhitbox.xMax;
  const yMin = y - playerhitbox.yMin;
  const yMax = y + playerhitbox.yMax;

  for (const wall of walls) {

   // if (wall.walkable === true) {

    //  continue;
    
   // }

    const halfWidth = wall.width / 2;
    const halfHeight = wall.height / 2;
    const wallhitboxtype = wall.hitboxtype ? wall.hitboxtype : "rect"

    switch (wallhitboxtype) {

      
      case "rect": {
        const wallLeft = wall.x - halfWidth;
        const wallRight = wall.x + halfWidth;
        const wallTop = wall.y - halfHeight;
        const wallBottom = wall.y + halfHeight;

        if (
          rectRectIntersection(
            xMin,
            xMax,
            yMin,
            yMax,
            wallLeft,
            wallRight,
            wallTop,
            wallBottom
          )
        ) {
          return true;
        }
        break;
      }

      case "circle": {
        const radius = Math.min(halfWidth, halfHeight);
        if (
          rectCircleIntersection(xMin, xMax, yMin, yMax, wall.x, wall.y, radius)
        ) {
          return true;
        }
        break;
      }
    }
  }

  return false;
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


function getCollidedWallsWithBullet(walls, x, y, height, width, direction) {
  const bulletCorners = getBulletCorners({ x, y }, width, height, direction);
  const collidedWalls = [];

  for (const wall of walls) {
    const halfWidth = wall.width / 2;
    const halfHeight = wall.height / 2;

    const wallCorners = [
      { x: wall.x - halfWidth, y: wall.y - halfHeight },
      { x: wall.x + halfWidth, y: wall.y - halfHeight },
      { x: wall.x + halfWidth, y: wall.y + halfHeight },
      { x: wall.x - halfWidth, y: wall.y + halfHeight },
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
  isCollisionWithPlayer,
  getBulletCorners
};