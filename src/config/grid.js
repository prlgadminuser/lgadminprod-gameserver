class GameGrid {
  constructor(width, height, cellSize = 30) {
    this.cellSize = cellSize;
    this.invCell = 1 / cellSize;

    this.width = (width * this.invCell) | 0;
    this.height = (height * this.invCell) | 0;

    // Offsets to allow negative world positions
    this.offsetX = this.width;
    this.offsetY = this.height;

    // 2D grid array
    this.grid = Array.from({ length: this.width * 2 + 1 }, () => []);
    this.objectsCells = new Map();

    this.nextId = 1;
  }

  // ----------------------
  // Convert world position to grid cell (with offset)
  // ----------------------
  _roundToCells(pos) {
    return {
      x: ((pos.x * this.invCell) | 0) + this.offsetX,
      y: ((pos.y * this.invCell) | 0) + this.offsetY,
    };
  }

  _cellsForObject(obj, pos) {
    const hw = (obj.width || 0) * 0.5;
    const hh = (obj.height || 0) * 0.5;

    const xMin = pos.x - hw;
    const xMax = pos.x + hw;
    const yMin = pos.y - hh;
    const yMax = pos.y + hh;

    const min = this._roundToCells({ x: xMin, y: yMin });
    const max = this._roundToCells({ x: xMax, y: yMax });

    const cells = [];
    for (let x = min.x; x <= max.x; x++) {
      for (let y = min.y; y <= max.y; y++) {
        cells.push(x, y);
      }
    }
    return cells;
  }

  addObject(obj) {
    if (!obj.position) throw new Error("Object must have position");
    if (!obj.gid) obj.gid = this.nextId++;

    this.updateObject(obj, obj.position);
  }

  updateObject(obj, newPosition) {
    if (!obj?.gid) return;

    const gid = obj.gid;

    const oldCells = this.objectsCells.get(gid) || [];
    const newCells = this._cellsForObject(obj, newPosition);

    if (this._arraysEqual(oldCells, newCells)) {
      obj.position = newPosition;
      return;
    }

    // Remove old cells
    for (let i = 0; i < oldCells.length; i += 2) {
      const x = oldCells[i];
      const y = oldCells[i + 1];

      const cell = this.grid[x]?.[y];
      if (cell) cell.delete(obj);
    }

    // Add new cells
    for (let i = 0; i < newCells.length; i += 2) {
      const x = newCells[i];
      const y = newCells[i + 1];

      if (!this.grid[x]) this.grid[x] = [];
      if (!this.grid[x][y]) this.grid[x][y] = new Set();

      this.grid[x][y].add(obj);
    }

    obj.position = newPosition;
    this.objectsCells.set(gid, newCells);
  }

  removeObject(obj) {
    const cells = this.objectsCells.get(obj.gid);
    if (!cells) return;

    for (let i = 0; i < cells.length; i += 2) {
      const x = cells[i];
      const y = cells[i + 1];
      const cell = this.grid[x]?.[y];
      if (cell) cell.delete(obj);
    }

    this.objectsCells.delete(obj.gid);
  }

  getObjectsInArea(xMin, xMax, yMin, yMax, typeFilter = null) {
    const min = this._roundToCells({ x: xMin, y: yMin });
    const max = this._roundToCells({ x: xMax, y: yMax });

    const result = new Set();

    for (let x = min.x; x <= max.x; x++) {
      const row = this.grid[x];
      if (!row) continue;

      for (let y = min.y; y <= max.y; y++) {
        const cell = row[y];
        if (!cell) continue;

        for (const obj of cell) {
          if (!typeFilter || obj.objectType === typeFilter) {
            result.add(obj);
          }
        }
      }
    }

    return [...result];
  }

  _arraysEqual(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }
}

module.exports = { GameGrid };