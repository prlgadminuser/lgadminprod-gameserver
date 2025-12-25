const allow_cell_coverage = true; // Not used now, but kept for future

class GameGrid {
  constructor(width, height, cellSize = 40) {
    this.cellSize = cellSize;
    this.width = Math.floor(width / cellSize);
    this.height = Math.floor(height / cellSize);
    this.grid = new Map();      // "x,y" → Set of gids (non-wall dynamic objects)
    this.wallGrid = new Map();  // "x,y" → Set of gids (static walls)
    this.objects = new Map();   // gid → object
    this.objectsCells = new Map(); // gid → Set of cell keys ("x,y") it occupies
    this.nextId = 1;
  }

  getCellKey(x, y) {
    return `${Math.floor(x / this.cellSize)},${Math.floor(y / this.cellSize)}`;
  }

  getCellsForObject(obj) {
    const width = obj.width || this.cellSize;
    const height = obj.height || this.cellSize;

    const halfW = width / 2;
    const halfH = height / 2;

    const xMin = obj.x - halfW;
    const xMax = obj.x + halfW;
    const yMin = obj.y - halfH;
    const yMax = obj.y + halfH;

    const xStart = Math.floor(xMin / this.cellSize);
    const xEnd = Math.floor(xMax / this.cellSize); // inclusive
    const yStart = Math.floor(yMin / this.cellSize);
    const yEnd = Math.floor(yMax / this.cellSize);

    const cells = new Set();
    for (let x = xStart; x <= xEnd; x++) {
      for (let y = yStart; y <= yEnd; y++) {
        cells.add(`${x},${y}`);
      }
    }
    return cells;
  }

  addObject(obj) {
    if (typeof obj.x !== "number" || typeof obj.y !== "number") {
      throw new Error("Object must have numeric 'x' and 'y' properties.");
    }

    if (!obj.gid) obj.gid = this.nextId++;

    const cells = this.getCellsForObject(obj);
    const targetGrid = obj.type === "wall" ? this.wallGrid : this.grid;

    for (const key of cells) {
      if (!targetGrid.has(key)) targetGrid.set(key, new Set());
      targetGrid.get(key).add(obj.gid);
    }

    this.objects.set(obj.gid, obj);
    this.objectsCells.set(obj.gid, cells);
  }

  removeObject(obj) {
    if (!obj?.gid) return;

    const cells = this.objectsCells.get(obj.gid);
    if (!cells) return;

    const targetGrid = obj.type === "wall" ? this.wallGrid : this.grid;

    for (const key of cells) {
      const set = targetGrid.get(key);
      if (set) {
        set.delete(obj.gid);
        if (set.size === 0) targetGrid.delete(key);
      }
    }

    this.objectsCells.delete(obj.gid);
    this.objects.delete(obj.gid);
  }

  updateObject(obj, newX, newY) {
    if (!obj?.gid || !this.objects.has(obj.gid)) return;

    const oldCells = this.objectsCells.get(obj.gid);
    if (!oldCells) return;

    // Temporarily update position to compute new cells
    const oldX = obj.x;
    const oldY = obj.y;
    obj.x = newX;
    obj.y = newY;

    const newCells = this.getCellsForObject(obj);

    // Restore if needed? No — we want to keep new position
    // But only if cells changed

    if (this.areCellSetsEqual(oldCells, newCells)) {
      // Same cells — just update position
      return;
    }

    // Remove from old cells
    const targetGrid = obj.type === "wall" ? this.wallGrid : this.grid;
    for (const key of oldCells) {
      if (!newCells.has(key)) {
        const set = targetGrid.get(key);
        if (set) {
          set.delete(obj.gid);
          if (set.size === 0) targetGrid.delete(key);
        }
      }
    }

    // Add to new cells
    for (const key of newCells) {
      if (!oldCells.has(key)) {
        if (!targetGrid.has(key)) targetGrid.set(key, new Set());
        targetGrid.get(key).add(obj.gid);
      }
    }

    // Update tracking
    this.objectsCells.set(obj.gid, newCells);
  }

  areCellSetsEqual(setA, setB) {
    if (setA.size !== setB.size) return false;
    for (const item of setA) {
      if (!setB.has(item)) return false;
    }
    return true;
  }

  hasObject(obj) {
    return !!(obj?.gid && this.objects.has(obj.gid));
  }

  getObjectsInArea(xMin, xMax, yMin, yMax, includeOnly = null, includeWalls = false) {
    const result = new Set(); // Use Set to avoid duplicates

    const xStart = Math.floor(xMin / this.cellSize);
    const xEnd = Math.floor(xMax / this.cellSize);
    const yStart = Math.floor(yMin / this.cellSize);
    const yEnd = Math.floor(yMax / this.cellSize);

    const gridsToSearch = [];
    if (includeOnly === "wall" || includeWalls) {
      gridsToSearch.push(this.wallGrid);
    }
    if (!includeOnly || includeOnly !== "wall") {
      gridsToSearch.push(this.grid);
    }

    for (let x = xStart; x <= xEnd; x++) {
      for (let y = yStart; y <= yEnd; y++) {
        const key = `${x},${y}`;
        for (const grid of gridsToSearch) {
          const set = grid.get(key);
          if (!set) continue;
          for (const gid of set) {
            const obj = this.objects.get(gid);
            if (obj && (!includeOnly || obj.type === includeOnly)) {
              result.add(obj);
            }
          }
        }
      }
    }

    return Array.from(result);
  }
}

module.exports = { GameGrid };
