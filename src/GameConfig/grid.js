

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

  addObject(obj) {
    if (typeof obj.x !== "number" || typeof obj.y !== "number") {
      throw new Error("Object must have numeric 'x' and 'y' properties.");
    }

    // Only one cell per object
    const key = this.getCellKey(obj.x, obj.y);

    // Assign gid if needed
    if (!obj.gid) obj.gid = this.nextId++;
    this.objects.set(obj.gid, obj);

    // Add to cell
    if (!this.grid.has(key)) this.grid.set(key, new Set());
    this.grid.get(key).add(obj.gid);
    this.objectsCells.set(obj.gid, new Set([key]));
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

    const oldKey = [...(this.objectsCells.get(obj.gid) || new Set())][0];
    const newKey = this.getCellKey(newX, newY);

    // Only update grid if object moved to a different cell
    if (oldKey !== newKey) {
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
    const result = []

    // Iterate only cells overlapping the area
    const xStart = Math.floor(xMin / this.cellSize);
    const xEnd = Math.floor(xMax / this.cellSize);
    const yStart = Math.floor(yMin / this.cellSize);
    const yEnd = Math.floor(yMax / this.cellSize);

    for (let x = xStart; x <= xEnd; x++) {
      for (let y = yStart; y <= yEnd; y++) {
        const key = `${x},${y}`;
        const set = this.grid.get(key);
        if (!set) continue;

        for (const gid of set) {
          const obj = this.objects.get(gid);
          if (obj && (!includeOnly || includeOnly === obj.type)) {
            result.push(obj);
          }
        }
      }
    }

    return result;
  }
}

module.exports = { GameGrid };
