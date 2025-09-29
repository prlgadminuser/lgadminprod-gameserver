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

    // Preallocate 2D array of sets for cells
    this.grid = Array.from({ length: this.width }, () =>
      Array.from({ length: this.height }, () => new Set())
    );

    this.objects = new Map();      // gid → object
    this.objectsCells = new Map(); // gid → Set of [x, y] pairs

    this.nextId = 1;
  }

  getCellCoords(x, y) {
    const cellX = Math.floor(x / this.cellSize);
    const cellY = Math.floor(y / this.cellSize);
    return [cellX, cellY];
  }

  _getKeysInArea(xMin, xMax, yMin, yMax) {
    const keys = [];
    const startX = Math.floor(xMin / this.cellSize);
    const endX = Math.floor(xMax / this.cellSize);
    const startY = Math.floor(yMin / this.cellSize);
    const endY = Math.floor(yMax / this.cellSize);

    for (let x = startX; x <= endX; x++) {
      for (let y = startY; y <= endY; y++) {
        if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
          keys.push([x, y]);
        }
      }
    }

    return keys;
  }

  addObject(obj) {
    if (typeof obj.x !== "number" || typeof obj.y !== "number") {
      throw new Error("Object must have numeric 'x' and 'y' properties.");
    }

    if (!obj.gid) obj.gid = this.nextId++;
    this.objects.set(obj.gid, obj);

    const rect = toRectangle({
      x: obj.x,
      y: obj.y,
      width: obj.width || 0,
      height: obj.height || 0
    });

    const keys = this._getKeysInArea(rect.min.x, rect.max.x, rect.min.y, rect.max.y);
    const cellSet = new Set();

    for (const [x, y] of keys) {
      this.grid[x][y].add(obj.gid);
      cellSet.add(`${x},${y}`);
    }

    this.objectsCells.set(obj.gid, cellSet);
  }

  removeObject(obj) {
    if (!obj || !obj.gid) return;

    const cells = this.objectsCells.get(obj.gid);
    if (cells) {
      for (const key of cells) {
        const [x, y] = key.split(',').map(Number);
        this.grid[x][y].delete(obj.gid);
      }
      this.objectsCells.delete(obj.gid);
    }

    this.objects.delete(obj.gid);
  }

  updateObject(obj, newX, newY) {
    if (!obj.gid) return;

    const rect = toRectangle({
      x: newX,
      y: newY,
      width: obj.width || 0,
      height: obj.height || 0
    });

    const newKeys = new Set(
      this._getKeysInArea(rect.min.x, rect.max.x, rect.min.y, rect.max.y)
        .map(([x, y]) => `${x},${y}`)
    );

    const oldKeys = this.objectsCells.get(obj.gid) || new Set();

    // Remove from cells that are no longer covered
    for (const key of oldKeys) {
      if (!newKeys.has(key)) {
        const [x, y] = key.split(',').map(Number);
        this.grid[x][y].delete(obj.gid);
      }
    }

    // Add to new cells
    for (const key of newKeys) {
      if (!oldKeys.has(key)) {
        const [x, y] = key.split(',').map(Number);
        this.grid[x][y].add(obj.gid);
      }
    }

    this.objectsCells.set(obj.gid, newKeys);

    obj.x = newX;
    obj.y = newY;
  }

  hasObject(obj) {
    return obj?.gid ? this.objects.has(obj.gid) : false;
  }

  getObjectsInArea(xMin, xMax, yMin, yMax, includeOnly) {
    const result = [];
    const seen = new Set();

    const keys = this._getKeysInArea(xMin, xMax, yMin, yMax);

    for (const [x, y] of keys) {
      for (const gid of this.grid[x][y]) {
        if (seen.has(gid)) continue;
        seen.add(gid);

        const obj = this.objects.get(gid);
        if (!obj) continue;
        if (includeOnly && includeOnly !== obj.type) continue;

        result.push(obj);
      }
    }

    return result;
  }
}

module.exports = { GameGrid };
