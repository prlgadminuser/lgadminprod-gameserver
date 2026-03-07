

const HASH_X = 73856093;
const HASH_Y = 19349663;

class Grid {
  constructor(cellSize = 30) {
    this.cellSize = cellSize;

    // Map<hashKey:number, Set<id:number>>
    this.cells = new Map();

    // Map<id:number, ProxyObject>
    this.objects = new Map();

    // Map<id:number, Set<hashKey>>
    this.objectCells = new Map();

    this.nextId = 1;
  }

  // -------------------------
  // Hashing
  // -------------------------

  _hash(cx, cy) {
    // fast numeric spatial hash
    return (cx * HASH_X) ^ (cy * HASH_Y);
  }

  _cellCoord(v) {
    return Math.floor(v / this.cellSize);
  }

  // -------------------------
  // Core Geometry
  // -------------------------

  _computeCells(xMin, yMin, xMax, yMax) {
    const cx0 = this._cellCoord(xMin);
    const cy0 = this._cellCoord(yMin);
    const cx1 = this._cellCoord(xMax);
    const cy1 = this._cellCoord(yMax);

    const result = new Set();

    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        result.add(this._hash(cx, cy));
      }
    }

    return result;
  }



  // -------------------------
  // Object API
  // -------------------------

  addObject(entity) {
  // entity example:
  // {
  //   id,
  //   position: { x, y },
  //   width,
  //   height,
  //   type
  // }

  if (
    !entity ||
    !entity.position ||
    typeof entity.position.x !== 'number' ||
    typeof entity.position.y !== 'number'
  ) {
    throw new Error("addObject(): invalid entity.position");
  }

  const proxy = {
    id: this.nextId++, //entity.id ?? this.nextId++,
    x: entity.position.x,
    y: entity.position.y,
    w: entity.width || 0,
    h: entity.height || 0,
    type: entity.type || 0,
    vx: 0,
    vy: 0
  };

  this.objects.set(proxy.id, proxy);

  const cells = this._computeCells(
    proxy.x - proxy.w / 2,
    proxy.y - proxy.h / 2,
    proxy.x + proxy.w / 2,
    proxy.y + proxy.h / 2
  );

  for (const key of cells) {
    let set = this.cells.get(key);
    if (!set) {
      set = new Set();
      this.cells.set(key, set);
    }
    set.add(proxy.id);
  }

  this.objectCells.set(proxy.id, cells);

  return proxy.id; // spatial id
}


  remove(id) {
    const cells = this.objectCells.get(id);
    if (cells) {
      for (const key of cells) {
        const set = this.cells.get(key);
        if (set) {
          set.delete(id);
          if (set.size === 0) this.cells.delete(key);
        }
      }
    }

    this.objectCells.delete(id);
    this.objects.delete(id);
  }

  // -------------------------
  // Movement Update (Swept Ready)
  // -------------------------

  move(id, newX, newY) {
    const obj = this.objects.get(id);
    if (!obj) return;

    const oldCells = this.objectCells.get(id);

    const xMin = newX - obj.w / 2;
    const yMin = newY - obj.h / 2;
    const xMax = newX + obj.w / 2;
    const yMax = newY + obj.h / 2;

    const newCells = this._computeCells(xMin, yMin, xMax, yMax);

    // fast diff
    if (oldCells && oldCells.size === newCells.size) {
      let same = true;
      for (const k of oldCells) {
        if (!newCells.has(k)) { same = false; break; }
      }
      if (same) {
        obj.x = newX;
        obj.y = newY;
        return;
      }
    }

    // remove old
    if (oldCells) {
      for (const key of oldCells) {
        if (!newCells.has(key)) {
          const set = this.cells.get(key);
          if (set) {
            set.delete(id);
            if (set.size === 0) this.cells.delete(key);
          }
        }
      }
    }

    // add new
    for (const key of newCells) {
      if (!oldCells || !oldCells.has(key)) {
        let set = this.cells.get(key);
        if (!set) {
          set = new Set();
          this.cells.set(key, set);
        }
        set.add(id);
      }
    }

    this.objectCells.set(id, newCells);
    obj.x = newX;
    obj.y = newY;
  }

  // -------------------------
  // Broadphase Query
  // -------------------------

  queryAABB(xMin, yMin, xMax, yMax, type = null) {
    const cx0 = this._cellCoord(xMin);
    const cy0 = this._cellCoord(yMin);
    const cx1 = this._cellCoord(xMax);
    const cy1 = this._cellCoord(yMax);

    const out = new Set();

    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const key = this._hash(cx, cy);
        const set = this.cells.get(key);
        if (!set) continue;

        for (const id of set) {
          const obj = this.objects.get(id);
          if (!obj) continue;
          if (type === null || obj.type === type) {
            out.add(obj);
          }
        }
      }
    }

    return out;
  }

  // -------------------------
  // Swept Raycast (for bullets / hitscan)
  // -------------------------

  raycast(x0, y0, x1, y1) {
    // DDA grid traversal (Amanatides & Woo)
    const dx = x1 - x0;
    const dy = y1 - y0;

    let cx = this._cellCoord(x0);
    let cy = this._cellCoord(y0);

    const stepX = Math.sign(dx);
    const stepY = Math.sign(dy);

    const tDeltaX = dx !== 0 ? Math.abs(this.cellSize / dx) : Infinity;
    const tDeltaY = dy !== 0 ? Math.abs(this.cellSize / dy) : Infinity;

    let tMaxX = dx !== 0
      ? ((cx + (stepX > 0 ? 1 : 0)) * this.cellSize - x0) / dx
      : Infinity;

    let tMaxY = dy !== 0
      ? ((cy + (stepY > 0 ? 1 : 0)) * this.cellSize - y0) / dy
      : Infinity;

    const visited = new Set();

    while (true) {
      const key = this._hash(cx, cy);
      if (!visited.has(key)) {
        visited.add(key);
        const set = this.cells.get(key);
        if (set) {
          for (const id of set) {
            const obj = this.objects.get(id);
            if (obj) return obj; // narrowphase should follow
          }
        }
      }

      if (tMaxX < tMaxY) {
        tMaxX += tDeltaX;
        cx += stepX;
      } else {
        tMaxY += tDeltaY;
        cy += stepY;
      }

      if (tMaxX > 1 && tMaxY > 1) break;
    }

    return null;
  }
}

module.exports = { Grid };