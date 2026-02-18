"use strict";

const { playerhitbox } = require("../config/player");
const { rectCircleIntersection, rectRectIntersection } = require("../utils/math");

const playerHalfWidth = playerhitbox.width;
const playerHalfHeight = playerhitbox.height;

// -------------------- WALL COLLISIONS --------------------
function isCollisionWithCachedWalls(walls, x, y) {
  const xMin = x - playerhitbox.xMin;
  const xMax = x + playerhitbox.xMax;
  const yMin = y - playerhitbox.yMin;
  const yMax = y + playerhitbox.yMax;

  for (let i = 0; i < walls.length; i++) {
    const wall = walls[i];
    const halfW = wall.width * 0.5;
    const halfH = wall.height * 0.5;
    const type = wall.hitboxtype || "rect";

    if (type === "rect") {
      const wLeft = wall.x - halfW;
      const wRight = wall.x + halfW;
      const wTop = wall.y - halfH;
      const wBottom = wall.y + halfH;

      if (rectRectIntersection(xMin, xMax, yMin, yMax, wLeft, wRight, wTop, wBottom))
        return true;
    } else { // circle
      const radius = Math.min(halfW, halfH);
      if (rectCircleIntersection(xMin, xMax, yMin, yMax, wall.x, wall.y, radius))
        return true;
    }
  }
  return false;
}

// -------------------- BULLET ROTATION --------------------
function rotatePoint(px, py, cx, cy, cosA, sinA) {
  const dx = px - cx;
  const dy = py - cy;
  return { x: cx + dx * cosA - dy * sinA, y: cy + dx * sinA + dy * cosA };
}

function getBulletCorners(bullet, w, h, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  const cosA = Math.cos(rad);
  const sinA = Math.sin(rad);
  const x = bullet.position.x;
  const y = bullet.position.y;
  const hw = w;
  const hh = h;

  // inline rotation, reuse cos/sin
  return [
    rotatePoint(x + hw, y + hh, x, y, cosA, sinA),
    rotatePoint(x - hw, y + hh, x, y, cosA, sinA),
    rotatePoint(x - hw, y - hh, x, y, cosA, sinA),
    rotatePoint(x + hw, y - hh, x, y, cosA, sinA),
  ];
}

// -------------------- PLAYER COLLISION --------------------
function isCollisionWithPlayer(bullet, player, bulletHeight, bulletWidth, bulletAngle) {
  const bCorners = getBulletCorners(bullet, bulletWidth, bulletHeight, bulletAngle);

  const px = player.x;
  const py = player.y;

  // re-use constants, no array creation per tick
  const pCorners = [
    { x: px - playerHalfWidth, y: py - playerHalfHeight },
    { x: px + playerHalfWidth, y: py - playerHalfHeight },
    { x: px + playerHalfWidth, y: py + playerHalfHeight },
    { x: px - playerHalfWidth, y: py + playerHalfHeight },
  ];

  return doPolygonsIntersect(bCorners, pCorners);
}

// -------------------- BULLET-WALL POLYGON COLLISION --------------------
function getCollidedWallsWithBullet(walls, x, y, height, width, direction) {
  const bCorners = getBulletCorners({ position: { x, y } }, width, height, direction);
  const collided = [];

  for (let i = 0; i < walls.length; i++) {
    const wall = walls[i];
    const hw = wall.width * 0.5;
    const hh = wall.height * 0.5;
    const wx = wall.x;
    const wy = wall.y;

    const wCorners = [
      { x: wx - hw, y: wy - hh },
      { x: wx + hw, y: wy - hh },
      { x: wx + hw, y: wy + hh },
      { x: wx - hw, y: wy + hh },
    ];

    if (doPolygonsIntersect(bCorners, wCorners)) collided.push(wall);
  }

  return collided;
}

// -------------------- SAT FUNCTIONS --------------------
function doPolygonsIntersect(a, b) {
  // Use loop unrolling for axis projections
  const polygons = [a, b];

  for (let p = 0; p < 2; p++) {
    const poly = polygons[p];
    for (let i = 0; i < poly.length; i++) {
      const p1 = poly[i];
      const p2 = poly[(i + 1) % poly.length];

      const axisX = -(p2.y - p1.y);
      const axisY = p2.x - p1.x;

      let [minA, maxA] = projectPolygon(a, axisX, axisY);
      let [minB, maxB] = projectPolygon(b, axisX, axisY);

      if (maxA < minB || maxB < minA) return false;
    }
  }

  return true;
}

function projectPolygon(polygon, axisX, axisY) {
  let min = Infinity;
  let max = -Infinity;

  for (let i = 0; i < polygon.length; i++) {
    const pt = polygon[i];
    const proj = pt.x * axisX + pt.y * axisY;
    if (proj < min) min = proj;
    if (proj > max) max = proj;
  }

  return [min, max];
}

module.exports = {
  getCollidedWallsWithBullet,
  isCollisionWithCachedWalls,
  isCollisionWithPlayer,
  getBulletCorners
};
