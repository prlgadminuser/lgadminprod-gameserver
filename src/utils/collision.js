

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

      const { x: wx, y: wy } = wall.position

    if (type === "rect") {
      const wLeft = wx - halfW;
      const wRight = wx + halfW;
      const wTop = wy - halfH;
      const wBottom = wy + halfH;

      if (rectRectIntersection(xMin, xMax, yMin, yMax, wLeft, wRight, wTop, wBottom))
        return true;
    } else { // circle
      const radius = Math.min(halfW, halfH);
      if (rectCircleIntersection(xMin, xMax, yMin, yMax, wx, wy, radius))
        return true;
    }
  }
  return false;
},


// -------------------- PLAYER COLLISION --------------------
isCollisionWithPlayer(bullet, player, bulletHeight, bulletWidth, bulletAngle) {
  const bCorners = getBulletCorners(bullet, bulletWidth, bulletHeight, bulletAngle);

   const { x: px, y: py } = player.position;

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
