


class Vec2 {
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }

  static fromAngle(deg) {
    const rad = deg * (Math.PI / 180);
    return new Vec2(Math.cos(rad), Math.sin(rad));
  }

  add(v) {
    return new Vec2(this.x + v.x, this.y + v.y);
  }

  scale(s) {
    return new Vec2(this.x * s, this.y * s);
  }

  static distanceSquared(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
  }
}

/* =========================
   SAT UTILITIES
========================= */
// Swept SAT for moving rectangle vs target rectangle
function sweptSATRectVsRect(start, end, w, h, angle, targetCenter, targetW, targetH, targetAngle) {
  // Tiny rectangle shortcut
  if (w < 3 && h < 3) {
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);

    const targetMinX = targetCenter.x - targetW / 2;
    const targetMaxX = targetCenter.x + targetW / 2;
    const targetMinY = targetCenter.y - targetH / 2;
    const targetMaxY = targetCenter.y + targetH / 2;

    if (maxX < targetMinX || minX > targetMaxX || maxY < targetMinY || minY > targetMaxY) {
      return { hit: false };
    } else {
      return { hit: true, t: 0, tExit: 1 };
    }
  } else {
    // --- Full SAT for larger rectangles ---
    function rotatePoint(p, angleRad) {
      const cos = Math.cos(angleRad);
      const sin = Math.sin(angleRad);
      return { x: cos * p.x - sin * p.y, y: sin * p.x + cos * p.y };
    }

    function getRectCorners(center, w, h, angle) {
      const hw = w / 2, hh = h / 2;
      const localCorners = [
        { x: -hw, y: -hh },
        { x: hw, y: -hh },
        { x: hw, y: hh },
        { x: -hw, y: hh },
      ];
      return localCorners.map(c => {
        const r = rotatePoint(c, angle);
        return { x: r.x + center.x, y: r.y + center.y };
      });
    }

    function getAxes(corners) {
      const axes = [];
      for (let i = 0; i < 4; i++) {
        const p1 = corners[i], p2 = corners[(i + 1) % 4];
        const edge = { x: p2.x - p1.x, y: p2.y - p1.y };
        const len = Math.hypot(-edge.y, edge.x);
        axes.push({ x: -edge.y / len, y: edge.x / len });
      }
      return axes;
    }

    function projectPoints(points, axis) {
      let min = Infinity, max = -Infinity;
      for (const p of points) {
        const proj = p.x * axis.x + p.y * axis.y;
        if (proj < min) min = proj;
        if (proj > max) max = proj;
      }
      return { min, max };
    }

    let tEnter = 0, tExit = 1;
    const movingCornersStart = getRectCorners(start, w, h, angle);
    const movingCornersEnd = getRectCorners(end, w, h, angle);
    const targetCorners = getRectCorners(targetCenter, targetW, targetH, targetAngle);
    const axes = [...getAxes(movingCornersStart), ...getAxes(targetCorners)];

    for (const axis of axes) {
      const projStart = projectPoints(movingCornersStart, axis);
      const projEnd = projectPoints(movingCornersEnd, axis);
      const projTarget = projectPoints(targetCorners, axis);
      const vel = ((projEnd.min + projEnd.max) - (projStart.min + projStart.max)) / 2;

      if (vel === 0) {
        if (projStart.max < projTarget.min || projStart.min > projTarget.max) {
          return { hit: false };
        } else {
          continue; // overlaps, move to next axis
        }
      } else {
        const t0 = (projTarget.min - projStart.max) / vel;
        const t1 = (projTarget.max - projStart.min) / vel;
        tEnter = Math.max(tEnter, Math.min(t0, t1));
        tExit = Math.min(tExit, Math.max(t0, t1));

        if (tEnter > tExit) {
          return { hit: false };
        }
      }
    }

    if (tEnter >= 0 && tEnter <= 1) {
      return { hit: true, t: tEnter, tExit: tExit };
    } else {
      return { hit: false };
    }
  }
}
module.exports =   {
    Vec2, 
    sweptSATRectVsRect

}