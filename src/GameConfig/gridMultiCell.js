function toRectangle(hitbox) {
  return {
    min: { x: hitbox.x, y: hitbox.y },
    max: { x: hitbox.x + (hitbox.width || 0), y: hitbox.y + (hitbox.height || 0) }
  };
}

class GameGrid {
  constructor(width, height, cellSize = 40) {
    this.cellSize = cellSize;
    this.width = Math.floor(width / cellSize);
    this.height = Math.floor(height / cellSize);

    this.grid = new Map();         // key = "x,y", value = Set of gids
    this.objects = new Map();      // gid → object
    this.objectsCells = new Map(); // gid → Set of cell keys
    this.nextId = 1;
  }

  getCellKey(x, y) {
    return `${Math.floor(x / this.cellSize)},${Math.floor(y / this.cellSize)}`;
  }

  _getKeysInArea(xMin, xMax, yMin, yMax) {
    const keys = [];
    for (let x = Math.floor(xMin / this.cellSize); x <= Math.floor(xMax / this.cellSize); x++) {
      for (let y = Math.floor(yMin / this.cellSize); y <= Math.floor(yMax / this.cellSize); y++) {
        keys.push(`${x},${y}`);
      }
    }
    return keys;
  }

  addObject(obj) {
  if (typeof obj.x !== "number" || typeof obj.y !== "number") {
    throw new Error("Object must have numeric 'x' and 'y' properties.");
  }

  const rect = toRectangle(obj);
  const keys = this._getKeysInArea(rect.min.x, rect.max.x, rect.min.y, rect.max.y);

  // Assign gid if needed
  if (!obj.gid) obj.gid = this.nextId++;
  this.objects.set(obj.gid, obj);

  // Add to cells
  const objCells = new Set();
  for (const key of keys) {
    if (!this.grid.has(key)) this.grid.set(key, new Set());
    this.grid.get(key).add(obj.gid);
    objCells.add(key);
  }
  this.objectsCells.set(obj.gid, objCells);
}


  removeObject(obj) {
    if (!obj?.gid) return;

    const cells = this.objectsCells.get(obj.gid);
    if (cells) {
      for (const key of cells) {
        const set = this.grid.get(key);
        if (set) {
          set.delete(obj.gid);
          if (set.size === 0) this.grid.delete(key);
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

    // Only re-add if object crosses into new cells
    if (!oldCells.has(newKey) || oldCells.size > 1) {
      this.removeObject(obj);
      obj.x = newX;
      obj.y = newY;
      this.addObject(obj);
    } else {
      obj.x = newX;
      obj.y = newY;
    }
  }

  hasObject(obj) {
    return !!(obj?.gid && this.objects.has(obj.gid));
  }

  getObjectsInArea(xMin, xMax, yMin, yMax, includeOnly) {
    const result = new Set()
    const keys = this._getKeysInArea(xMin, xMax, yMin, yMax);

    for (const key of keys) {
      const set = this.grid.get(key);
      if (!set) continue;

      for (const gid of set) {
        const obj = this.objects.get(gid);
        if (obj && (!includeOnly || includeOnly === obj.type)) {
          result.add(obj);
        }
      }
    }

    return result;
  }
}


module.exports = { GameGrid };