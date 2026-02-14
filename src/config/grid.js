const allow_cell_coverage = true;

class GameGrid {
  constructor(width, height, cellSize = 30) {
    this.cellSize = cellSize;
    this.width = Math.floor(width / cellSize);   // cells wide
    this.height = Math.floor(height / cellSize); // cells high

    this.grid = new Map();           // cellKey → Set of gids (non-walls)
    this.wallGrid = new Map();       // cellKey → Set of gids (walls)
    this.wallCells = new Map();      // gid → cellKey (walls only – single cell)
    this.objects = new Map();        // gid → object
    this.objectsCellBounds = new Map(); // gid → {xStart, yStart, xEnd, yEnd} (non-walls only)
    this.nextId = 1;
  }

  getCellKey(cx, cy) {
    return `${cx},${cy}`;
  }

  // Fixed to match original getCellsForObject logic (no spill on exact boundaries)
  getCellBounds(x, y, providedWidth, providedHeight) {
    const width = providedWidth || this.cellSize;
    const height = providedHeight || this.cellSize;

    const xMin = x - width / 2;
    const xMax = x + width / 2;
    const yMin = y - height / 2;
    const yMax = y + height / 2;

    const xStart = Math.floor(xMin / this.cellSize);
    const xEnd   = Math.ceil(xMax / this.cellSize) - 1;
    const yStart = Math.floor(yMin / this.cellSize);
    const yEnd   = Math.ceil(yMax / this.cellSize) - 1;

    return { xStart, xEnd, yStart, yEnd };
  }

  addObject(obj) {
    if (typeof obj.x !== "number" || typeof obj.y !== "number") {
      throw new Error("Object must have numeric 'x' and 'y' properties.");
    }

    if (!obj.gid) obj.gid = this.nextId++;

    this.objects.set(obj.gid, obj);

    const targetGrid = obj.type === "wall" ? this.wallGrid : this.grid;

    if (obj.type === "wall") {
      // Walls are always exactly 1 cell → no loop, no bounds object
      const bounds = this.getCellBounds(obj.x, obj.y, obj.width, obj.height);
      const key = this.getCellKey(bounds.xStart, bounds.yStart);

      if (!targetGrid.has(key)) targetGrid.set(key, new Set());
      targetGrid.get(key).add(obj.gid);

      this.wallCells.set(obj.gid, key);
    } else {
      const bounds = this.getCellBounds(obj.x, obj.y, obj.width, obj.height);
      this.objectsCellBounds.set(obj.gid, bounds);

      for (let cx = bounds.xStart; cx <= bounds.xEnd; cx++) {
        for (let cy = bounds.yStart; cy <= bounds.yEnd; cy++) {
          const key = this.getCellKey(cx, cy);
          if (!targetGrid.has(key)) targetGrid.set(key, new Set());
          targetGrid.get(key).add(obj.gid);
        }
      }
    }
  }

  removeObject(obj) {
    if (!obj?.gid) return;

    const targetGrid = obj.type === "wall" ? this.wallGrid : this.grid;

    if (obj.type === "wall") {
      const key = this.wallCells.get(obj.gid);
      if (key) {
        const set = targetGrid.get(key);
        if (set) {
          set.delete(obj.gid);
          if (set.size === 0) targetGrid.delete(key);
        }
        this.wallCells.delete(obj.gid);
      }
    } else {
      const bounds = this.objectsCellBounds.get(obj.gid);
      if (bounds) {
        for (let cx = bounds.xStart; cx <= bounds.xEnd; cx++) {
          for (let cy = bounds.yStart; cy <= bounds.yEnd; cy++) {
            const key = this.getCellKey(cx, cy);
            const set = targetGrid.get(key);
            if (set) {
              set.delete(obj.gid);
              if (set.size === 0) targetGrid.delete(key);
            }
          }
        }
        this.objectsCellBounds.delete(obj.gid);
      }
    }

    this.objects.delete(obj.gid);
  }

  updateObject(obj, newX, newY) {
    if (!obj.gid) return;

    if (obj.type === "wall") {
      const oldKey = this.wallCells.get(obj.gid);
      if (!oldKey) {
        obj.x = newX;
        obj.y = newY;
        return;
      }

      const bounds = this.getCellBounds(newX, newY, obj.width, obj.height);
      const newKey = this.getCellKey(bounds.xStart, bounds.yStart);

      if (oldKey !== newKey) {
        this.removeObject(obj);
        obj.x = newX;
        obj.y = newY;
        this.addObject(obj);
      } else {
        obj.x = newX;
        obj.y = newY;
      }
    } else {
      // non-wall – same fast "same coverage" check as before
      const oldBounds = this.objectsCellBounds.get(obj.gid);
      if (!oldBounds) {
        obj.x = newX;
        obj.y = newY;
        return;
      }

      const newBounds = this.getCellBounds(newX, newY, obj.width, obj.height);

      if (oldBounds.xStart === newBounds.xStart &&
          oldBounds.xEnd   === newBounds.xEnd &&
          oldBounds.yStart === newBounds.yStart &&
          oldBounds.yEnd   === newBounds.yEnd) {
        obj.x = newX;
        obj.y = newY;
        return;
      }

      this.removeObject(obj);
      obj.x = newX;
      obj.y = newY;
      this.addObject(obj);
    }
  }

  hasObject(obj) {
    return !!(obj?.gid && this.objects.has(obj.gid));
  }

  getObjectsInArea(xMin, xMax, yMin, yMax, includeOnly, includeWalls) {
    const result = [];
    const seen = new Set();

    const cxStart = Math.floor(xMin / this.cellSize);
    const cxEnd   = Math.floor(xMax / this.cellSize);
    const cyStart = Math.floor(yMin / this.cellSize);
    const cyEnd   = Math.floor(yMax / this.cellSize);

    let gridsToSearch;
    if (includeOnly === "wall") {
      gridsToSearch = [this.wallGrid];
    } else if (!includeOnly && includeWalls) {
      gridsToSearch = [this.grid, this.wallGrid];
    } else {
      gridsToSearch = [this.grid];
    }

    for (let cx = cxStart; cx <= cxEnd; cx++) {
      for (let cy = cyStart; cy <= cyEnd; cy++) {
        const key = this.getCellKey(cx, cy);

        for (const targetGrid of gridsToSearch) {
          const set = targetGrid.get(key);
          if (!set) continue;

          for (const gid of set) {
            if (seen.has(gid)) continue;
            seen.add(gid);

            const obj = this.objects.get(gid);
            if (obj && (!includeOnly || includeOnly === obj.type)) {
              result.push(obj);
            }
          }
        }
      }
    }

    return result;
  }
}

module.exports = { GameGrid };
