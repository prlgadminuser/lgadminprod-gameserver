


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

  subtract(vec) {
    return new Vec2(this.x - vec.x, this.y - vec.y);
  }


  scale(s) {
    return new Vec2(this.x * s, this.y * s);
  }

  static distanceSquared(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
  }

   distance(vec) {
    return Math.sqrt(this.distanceSquared(vec));
  }
}

function sweptSATRectVsRectOnlyFrontPoints(start, end, w, h, angle, targetCenter, targetW, targetH, targetAngle) {
  // For tiny bullets, fallback to AABB
  if (w < 3 && h < 3) {
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);

    const tMinX = targetCenter.x - targetW / 2;
    const tMaxX = targetCenter.x + targetW / 2;
    const tMinY = targetCenter.y - targetH / 2;
    const tMaxY = targetCenter.y + targetH / 2;

    return maxX < tMinX || minX > tMaxX || maxY < tMinY || minY > tMaxY
      ? { hit: false }
      : { hit: true, t: 0, tExit: 1 };
  }

  const rad = angle;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  // Calculate only the two front points of the bullet
  const frontOffsetX = w / 2;
  const frontOffsetY = h / 2;

  const startFront1 = {
    x: start.x + cos * frontOffsetX - sin * -frontOffsetY,
    y: start.y + sin * frontOffsetX + cos * -frontOffsetY
  };
  const startFront2 = {
    x: start.x + cos * frontOffsetX - sin * frontOffsetY,
    y: start.y + sin * frontOffsetX + cos * frontOffsetY
  };

  const endFront1 = {
    x: end.x + cos * frontOffsetX - sin * -frontOffsetY,
    y: end.y + sin * frontOffsetX + cos * -frontOffsetY
  };
  const endFront2 = {
    x: end.x + cos * frontOffsetX - sin * frontOffsetY,
    y: end.y + sin * frontOffsetX + cos * frontOffsetY
  };

  const bulletPointsStart = [startFront1, startFront2];
  const bulletPointsEnd = [endFront1, endFront2];

  // Rotate target corners
  function rotatePoint(p, angleRad) {
    const c = Math.cos(angleRad), s = Math.sin(angleRad);
    return { x: c * p.x - s * p.y, y: s * p.x + c * p.y };
  }

  function getCorners(center, w, h, angle) {
    const hw = w / 2, hh = h / 2;
    const local = [
      { x: -hw, y: -hh }, { x: hw, y: -hh },
      { x: hw, y: hh }, { x: -hw, y: hh }
    ];
    return local.map(p => {
      const r = rotatePoint(p, angle);
      return { x: r.x + center.x, y: r.y + center.y };
    });
  }

  const targetCorners = getCorners(targetCenter, targetW, targetH, targetAngle);

  // SAT axes: only edges of target + bullet front line
  const axes = [];
  // Edge of bullet front
  const edge = { x: bulletPointsStart[1].x - bulletPointsStart[0].x, y: bulletPointsStart[1].y - bulletPointsStart[0].y };
  const len = Math.hypot(edge.x, edge.y);
  axes.push({ x: -edge.y / len, y: edge.x / len });

  // Edges of target rectangle
  for (let i = 0; i < 4; i++) {
    const p1 = targetCorners[i], p2 = targetCorners[(i + 1) % 4];
    const e = { x: p2.x - p1.x, y: p2.y - p1.y };
    const l = Math.hypot(e.x, e.y);
    axes.push({ x: -e.y / l, y: e.x / l });
  }

  function project(points, axis) {
    let min = Infinity, max = -Infinity;
    for (const p of points) {
      const proj = p.x * axis.x + p.y * axis.y;
      if (proj < min) min = proj;
      if (proj > max) max = proj;
    }
    return { min, max };
  }

  let tEnter = 0, tExit = 1;

  for (const axis of axes) {
    const projStart = project(bulletPointsStart, axis);
    const projEnd = project(bulletPointsEnd, axis);
    const projTarget = project(targetCorners, axis);

    const vel = ((projEnd.min + projEnd.max) - (projStart.min + projStart.max)) / 2;

    if (vel === 0) {
      if (projStart.max < projTarget.min || projStart.min > projTarget.max) return { hit: false };
    } else {
      const t0 = (projTarget.min - projStart.max) / vel;
      const t1 = (projTarget.max - projStart.min) / vel;
      tEnter = Math.max(tEnter, Math.min(t0, t1));
      tExit = Math.min(tExit, Math.max(t0, t1));
      if (tEnter > tExit) return { hit: false };
    }
  }

  return tEnter >= 0 && tEnter <= 1 ? { hit: true, t: tEnter, tExit } : { hit: false };
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