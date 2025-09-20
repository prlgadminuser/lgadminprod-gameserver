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
      return true;
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

  const nearbyWalls = grid.getObjectsInArea(xMin, xMax, yMin, yMax);

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



function toDegrees(radians) {
  return radians * (180 / Math.PI);
}


function findCollidedWalls(grid, x, y, height, width) { 
  const xMin = x - width;
  const xMax = x + width;
  const yMin = y - height;
  const yMax = y + height;

  const nearbyWalls = grid.getObjectsInArea(xMin, xMax, yMin, yMax);

  return nearbyWalls.filter((wall) => {
    const wallLeft = wall.x - halfBlockSize;
    const wallRight = wall.x + halfBlockSize;
    const wallTop = wall.y - halfBlockSize;
    const wallBottom = wall.y + halfBlockSize;

    // Check for an axis-aligned bounding box collision
    return (
      xMax > wallLeft &&
      xMin < wallRight &&
      yMax > wallTop &&
      yMin < wallBottom
    );
  });
}


/**
 * Adjusts the bullet's direction to simulate a reflection off a wall.
 * This function assumes an axis-aligned bounding box collision model.
 * @param {Bullet} bullet The bullet object.
 * @param {Object} wall The wall object the bullet collided with.
 */
function adjustBulletDirection(bullet, wall) {
    // Convert the current direction to a vector for easier reflection.
    const incomingVector = {
        x: Math.cos(toRadians(bullet.direction)),
        y: Math.sin(toRadians(bullet.direction)),
    };

    const wallLeft = wall.x - halfBlockSize;
    const wallRight = wall.x + halfBlockSize;
    const wallTop = wall.y - halfBlockSize;
    const wallBottom = wall.y + halfBlockSize;

    // Determine the side of the wall that was hit and reflect the vector.
    // We check which axis the bullet is most likely colliding with to determine the reflection.
    // This is a simple, effective method for axis-aligned collisions.

    // Calculate the distance to each face of the wall.
    const distToLeft = Math.abs(bullet.position.x - wallLeft);
    const distToRight = Math.abs(bullet.position.x - wallRight);
    const distToTop = Math.abs(bullet.position.y - wallTop);
    const distToBottom = Math.abs(bullet.position.y - wallBottom);

    const isHorizontalCollision = Math.min(distToLeft, distToRight) < Math.min(distToTop, distToBottom);

    if (isHorizontalCollision) {
        // Reflect across the y-axis (horizontal wall) by negating the y component.
        incomingVector.x *= -1;
    } else {
        // Reflect across the x-axis (vertical wall) by negating the x component.
        incomingVector.y *= -1;
    }

    // Convert the reflected vector back to a direction angle and update the bullet.
    const reflectionAngleRad = Math.atan2(incomingVector.y, incomingVector.x);
    let reflectionAngleDeg = toDegrees(reflectionAngleRad);

    // Normalize the angle to be between 0 and 360.
    bullet.direction = reflectionAngleDeg;
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
  adjustBulletDirection,
  findCollidedWalls,
  isCollisionWithPlayer,
};
