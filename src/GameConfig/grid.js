

//const cellSize = 40;

 function toRectangle(hitbox) {
  return {
    min: { x: hitbox.x, y: hitbox.y },
    max: { x: hitbox.x + hitbox.width, y: hitbox.y + hitbox.height }
  };
}

class GameGrid {
  constructor(width, height, cellSize = 40) {
    this.cellSize = cellSize;

    this.width = Math.floor(width / this.cellSize);
    this.height = Math.floor(height / this.cellSize);

    // Use a Map for the grid: key = "x,y", value = Set of gids
    this.grid = new Map();

    // gid → object
    this.objects = new Map();

    // gid → Set of cell keys
    this.objectsCells = new Map();

    this.nextId = 1;
  }

  getCellKey(x, y) {
    const cellX = Math.floor(x / this.cellSize);
    const cellY = Math.floor(y / this.cellSize);
    return `${cellX},${cellY}`;
  }

 addObject(obj) {
  if (typeof obj.x !== "number" || typeof obj.y !== "number") {
    throw new Error("Object must have numeric 'x' and 'y' properties.");
  }

  // Assign a unique gid if not already
  if (!obj.gid) {
    obj.gid = this.nextId++;
  }

  this.objects.set(obj.gid, obj);

  // Build bounding box
  const rect = toRectangle({
    x: obj.x,
    y: obj.y,
    width: obj.width || 0,
    height: obj.height || 0
  });

  const keys = this._getKeysInArea(rect.min.x, rect.max.x, rect.min.y, rect.max.y);

  for (const key of keys) {
    if (!this.grid.has(key)) {
      this.grid.set(key, new Set());
    }
    this.grid.get(key).add(obj.gid);

    if (!this.objectsCells.has(obj.gid)) {
      this.objectsCells.set(obj.gid, new Set());
    }
    this.objectsCells.get(obj.gid).add(key);
  }
}


  removeObject(obj) {
    if (!obj || !obj.gid) return;

    const cells = this.objectsCells.get(obj.gid);
    if (cells) {
      for (const key of cells) {
        const set = this.grid.get(key);
        if (set) {
          set.delete(obj.gid);
          if (set.size === 0) {
            this.grid.delete(key);
          }
        }
      }
      this.objectsCells.delete(obj.gid);
    }

    this.objects.delete(obj.gid);
  }

  updateObject(obj, newX, newY) {
    if (!obj.gid) return;

    const oldCells = this.objectsCells.get(obj.gid) || new Set();
    const newKey = this.getCellKey(newX, newY);

    if (!oldCells.has(newKey) || oldCells.size > 1) {
      // Remove old references
      this.removeObject(obj);

      // Update position
      obj.x = newX;
      obj.y = newY;

      // Re-add with new cells
      this.addObject(obj);
    } else {
      // Just move coordinates if still in same cell
      obj.x = newX;
      obj.y = newY;
    }
  }

  hasObject(obj) {
    if (!obj || !obj.gid) return false;
    return this.objects.has(obj.gid);
  }

  getObjectsInArea(xMin, xMax, yMin, yMax, includeOnly) {
    const result = [];
    const keys = this._getKeysInArea(xMin, xMax, yMin, yMax);

    for (const key of keys) {
      const set = this.grid.get(key);
      if (set) {
        for (const gid of set) {
          const obj = this.objects.get(gid);
          if (!obj) continue;

          if (includeOnly && includeOnly !== obj.type) continue;

          result.push(obj);
        }
      }
    }

    return result;
  }

  _getKeysInArea(xMin, xMax, yMin, yMax) {
    const keys = [];
    const startX = Math.floor(xMin / this.cellSize);
    const endX = Math.floor(xMax / this.cellSize);
    const startY = Math.floor(yMin / this.cellSize);
    const endY = Math.floor(yMax / this.cellSize);

    for (let x = startX; x <= endX; x++) {
      for (let y = startY; y <= endY; y++) {
        keys.push(`${x},${y}`);
      }
    }

    return keys;
  }
}



module.exports = { GameGrid }
