module.exports = { 

toRectangle(hitbox) {
  const w = hitbox.width || 0;
  const h = hitbox.height || 0;

  return {
    min: { x: hitbox.x,     y: hitbox.y },
    max: { x: hitbox.x + w, y: hitbox.y + h }
  };
},

  getDistance(x1, y1, x2, y2) {
    return Math.sqrt(Math.pow(x1 - x2, 2) + Math.pow(y1 - y2, 2));
  },

  // --- Utility collision functions ---

  // Axis-Aligned Bounding Box (AABB) vs AABB
  rectRectIntersection(axMin, axMax, ayMin, ayMax, bxMin, bxMax, byMin, byMax) {
    return (
      axMax > bxMin &&
      axMin < bxMax &&
      ayMax > byMin &&
      ayMin < byMax
    );
  },

  // Rectangle vs Circle
  // Rect defined by min/max, circle by cx, cy, r
  rectCircleIntersection(xMin, xMax, yMin, yMax, cx, cy, r) {
    const closestX = Math.max(xMin, Math.min(cx, xMax));
    const closestY = Math.max(yMin, Math.min(cy, yMax));
    const dx = cx - closestX;
    const dy = cy - closestY;
    return dx * dx + dy * dy < r * r;
  },

  // Circle vs Circle
  circleCircleIntersection(ax, ay, ar, bx, by, br) {
    const dx = ax - bx;
    const dy = ay - by;
    const distSq = dx * dx + dy * dy;
    const rSum = ar + br;
    return distSq < rSum * rSum;
  }

};
