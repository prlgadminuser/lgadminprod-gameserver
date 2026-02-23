const allow_cell_coverage = true

class GameGrid {
  constructor(width, height, cellSize = 31) {
    this.cellSize = cellSize;
    this.width = Math.floor(width / cellSize);
    this.height = Math.floor(height / cellSize);

    this.offsetX = 0
    this.offsetY = 0 

    // Single unified grid (faster + simpler)
    this.grid = new Map();          // key -> Set<gid>
    this.objects = new Map();       // gid -> object
    this.objectsCells = new Map();  // gid -> Set<cellKey>

    this.nextId = 1;
  }

  // -------------------------
  // Cell Utilities
  // -------------------------

  getCellCoords(x, y) {
    return {
      cx: Math.floor((x - this.offsetX) / this.cellSize),
      cy: Math.floor((y - this.offsetY) / this.cellSize),
    };
  }

  getCellKeyFromCoords(cx, cy) {
    return `${cx},${cy}`;
  }

  getCellsForObject(obj) {
    const width = obj.width || this.cellSize;
    const height = obj.height || this.cellSize;

    const xMin = obj.x - width / 2;
    const xMax = obj.x + width / 2;
    const yMin = obj.y - height / 2;
    const yMax = obj.y + height / 2;

    const xStart = Math.floor((xMin - this.offsetX) / this.cellSize);
    const xEnd   = Math.floor((xMax - this.offsetX) / this.cellSize);
    const yStart = Math.floor((yMin - this.offsetY) / this.cellSize);
    const yEnd   = Math.floor((yMax - this.offsetY) / this.cellSize);

    const cells = new Set();

    for (let x = xStart; x <= xEnd; x++) {
      for (let y = yStart; y <= yEnd; y++) {
        cells.add(`${x},${y}`);
      }
    }

    return cells;
  }

  // -------------------------
  // Core Operations
  // -------------------------

  addObject(obj) {

    if (typeof obj.x !== "number" || typeof obj.y !== "number") {
      throw new Error("Object must have numeric 'x' and 'y'.");
    }

    if (!obj.gid) obj.gid = this.nextId++;

    this.objects.set(obj.gid, obj);

    const cells = allow_cell_coverage
      ? this.getCellsForObject(obj)
      : new Set([this.getCellKeyFromCoords(
          ...Object.values(this.getCellCoords(obj.x, obj.y))
        )]);

    for (const key of cells) {
      if (!this.grid.has(key)) {
        this.grid.set(key, new Set());
      }
      this.grid.get(key).add(obj.gid);
    }

    this.objectsCells.set(obj.gid, cells);
  }

  removeObject(obj) {
    if (!obj?.gid) return;

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
    }

    this.objectsCells.delete(obj.gid);
    this.objects.delete(obj.gid);
  }

  updateObject(obj, newX, newY) {
    if (!obj?.gid) return;

    const oldCells = this.objectsCells.get(obj.gid) || new Set();

    obj.x = newX;
    obj.y = newY;

    const newCells = allow_cell_coverage
      ? this.getCellsForObject(obj)
      : new Set([this.getCellKeyFromCoords(
          ...Object.values(this.getCellCoords(newX, newY))
        )]);

    // Fast path: no change
    if (this._setsEqual(oldCells, newCells)) {
      return;
    }

    // Remove from cells no longer occupied
    for (const key of oldCells) {
      if (!newCells.has(key)) {
        const set = this.grid.get(key);
        if (set) {
          set.delete(obj.gid);
          if (set.size === 0) {
            this.grid.delete(key);
          }
        }
      }
    }

    // Add to newly occupied cells
    for (const key of newCells) {
      if (!oldCells.has(key)) {
        if (!this.grid.has(key)) {
          this.grid.set(key, new Set());
        }
        this.grid.get(key).add(obj.gid);
      }
    }

    this.objectsCells.set(obj.gid, newCells);
  }

  hasObject(obj) {
    return !!(obj?.gid && this.objects.has(obj.gid));
  }

  // -------------------------
  // Queries
  // -------------------------

  getObjectsInArea(xMin, xMax, yMin, yMax, typeFilter = null) {
    const xStart = Math.floor((xMin - this.offsetX) / this.cellSize);
    const xEnd   = Math.floor((xMax - this.offsetX) / this.cellSize);
    const yStart = Math.floor((yMin - this.offsetY) / this.cellSize);
    const yEnd   = Math.floor((yMax - this.offsetY) / this.cellSize);

    const result = new Set(); // dedupe automatically

    for (let x = xStart; x <= xEnd; x++) {
      for (let y = yStart; y <= yEnd; y++) {
        const key = `${x},${y}`;
        const set = this.grid.get(key);
        if (!set) continue;

        for (const gid of set) {
          const obj = this.objects.get(gid);
          if (!obj) continue;
          if (!typeFilter || obj.objectType === typeFilter) {
            result.add(obj);
          }
        }
      }
    }

    return [...result];
  }

  // -------------------------
  // Internal Helpers
  // -------------------------

  _setsEqual(a, b) {
    if (a.size !== b.size) return false;
    for (const val of a) {
      if (!b.has(val)) return false;
    }
    return true;
  }
}

module.exports = { GameGrid };
