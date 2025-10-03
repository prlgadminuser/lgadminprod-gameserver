class GameGrid {
  constructor(width, height, cellSize = 40) {
    this.cellSize = cellSize;
    this.width = Math.floor(width / cellSize);
    this.height = Math.floor(height / cellSize);

    this.grid = new Map();         // key = "x,y", value = Set of gids (non-wall objects)
    this.wallGrid = new Map();     // key = "x,y", value = Set of gids (walls only)
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

    const key = this.getCellKey(obj.x, obj.y);

    if (!obj.gid) obj.gid = this.nextId++;
    this.objects.set(obj.gid, obj);

    // Put into walls or normal grid
    const targetGrid = obj.type === "wall" ? this.wallGrid : this.grid;

    if (!targetGrid.has(key)) targetGrid.set(key, new Set());
    targetGrid.get(key).add(obj.gid);

    this.objectsCells.set(obj.gid, new Set([key]));
  }

  removeObject(obj) {
    if (!obj?.gid) return;

    const cells = this.objectsCells.get(obj.gid);
    if (cells) {
      for (const key of cells) {
        const targetGrid = obj.type === "wall" ? this.wallGrid : this.grid;
        const set = targetGrid.get(key);
        if (set) {
          set.delete(obj.gid);
          if (set.size === 0) targetGrid.delete(key);
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

  getObjectsInArea(xMin, xMax, yMin, yMax, includeOnly, IncludeWalls) {
  const result = [];

  const xStart = Math.floor(xMin / this.cellSize);
  const xEnd = Math.floor(xMax / this.cellSize);
  const yStart = Math.floor(yMin / this.cellSize);
  const yEnd = Math.floor(yMax / this.cellSize);

  // Decide which grids to search
  let gridsToSearch;
  if (includeOnly === "wall") {
    gridsToSearch = [this.wallGrid];
  } else if (!includeOnly && IncludeWalls) {
    gridsToSearch = [this.grid, this.wallGrid]; // search both if no filter
  } else {
    gridsToSearch = [this.grid]; // other types
  }

  for (let x = xStart; x <= xEnd; x++) {
    for (let y = yStart; y <= yEnd; y++) {
      const key = `${x},${y}`;

      for (const targetGrid of gridsToSearch) {
        const set = targetGrid.get(key);
        if (!set) continue;

        for (const gid of set) {
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
