const { toRectangle } = require("../Battle/utils/math");

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
    const cell = this._roundToCells(x, y);
    return `${cell.x},${cell.y}`;
  }

  _getKeysInArea(xMin, xMax, yMin, yMax) {
    const keys = [];
    const start = this._roundToCells(xMin, yMin);
    const end = this._roundToCells(xMax, yMax);

    for (let x = start.x; x <= end.x; x++) {
      for (let y = start.y; y <= end.y; y++) {
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

    if (!obj.gid) obj.gid = this.nextId++;
    this.objects.set(obj.gid, obj);

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
    const newCellKey = this.getCellKey(newX, newY);

    if (!oldCells.has(newCellKey) || oldCells.size > 1) {
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
    const result = new Set();
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

  _roundToCells(x, y) {
    const clamp = (val, min, max) => Math.max(min, Math.min(max, val));
    return {
      x: clamp(Math.floor(x / this.cellSize), 0, this.width - 1),
      y: clamp(Math.floor(y / this.cellSize), 0, this.height - 1)
    };
  }
}

module.exports = { GameGrid };
