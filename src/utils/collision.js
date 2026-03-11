

const { rectCircleIntersection, rectRectIntersection } = require("../utils/math");


"use strict";

module.exports = {

  // -------------------- WALL COLLISIONS --------------------

isCollisionWithWalls(player, walls, x, y) {
  
  const halfWidth = player.width / 2;
const halfHeight = player.height / 2;

  const xMin = x - halfWidth
  const xMax = x + halfWidth
  const yMin = y - halfHeight
  const yMax = y + halfHeight

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



}
