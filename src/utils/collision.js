

const { playerhitbox } = require("../config/player");
const { rectCircleIntersection, rectRectIntersection } = require("../utils/math");

const playerHalfWidth = playerhitbox.width;
const playerHalfHeight = playerhitbox.height;

// -------------------- BULLET ROTATION --------------------




// -------------------- SAT FUNCTIONS --------------------



module.exports = {

  // -------------------- WALL COLLISIONS --------------------

isCollisionWithWalls(walls, x, y) {
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
},


// -------------------- PLAYER COLLISION --------------------
isCollisionWithPlayer(bullet, player, bulletHeight, bulletWidth, bulletAngle) {
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
},


}
