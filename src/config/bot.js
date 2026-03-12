const { GameGrid } = require("./GameGrid"); // your grid module

class AiEntity {
  constructor(grid, startPos, speed = 1) {
    this.grid = grid;             // reference to GameGrid
    this.position = { ...startPos };
    this.speed = speed;           // units per tick
    this.gid = null;              // optional for grid storage
    this.path = [];               // current path as array of {x,y} waypoints
  }

  setTarget(targetPos) {
    this.target = { ...targetPos };
    this.path = this._findPath(this.position, this.target);
  }

  update() {
    if (!this.path || this.path.length === 0) return;

    const next = this.path[0];
    const dx = next.x - this.position.x;
    const dy = next.y - this.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist <= this.speed) {
      // reach waypoint
      this.position.x = next.x;
      this.position.y = next.y;
      this.path.shift(); // remove waypoint
    } else {
      // move toward waypoint
      this.position.x += (dx / dist) * this.speed;
      this.position.y += (dy / dist) * this.speed;
    }
  }

  // Simple BFS pathfinding (grid-based, ignores diagonal)
  _findPath(start, end) {
    const startCell = this.grid._roundToCells(start);
    const endCell = this.grid._roundToCells(end);

    const visited = new Set();
    const queue = [[startCell.x, startCell.y, []]]; // x, y, path

    const key = (x, y) => `${x},${y}`;

    const directions = [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ];

    while (queue.length > 0) {
      const [x, y, path] = queue.shift();
      const k = key(x, y);
      if (visited.has(k)) continue;
      visited.add(k);

      // stop if reached target
      if (x === endCell.x && y === endCell.y) return path;

      // check neighbors
      for (const d of directions) {
        const nx = x + d.x;
        const ny = y + d.y;

        const cell = this.grid.grid[nx]?.[ny];
        if (!cell || cell.size === 0 || cell.has(this)) { 
          // free space or ignore self
          queue.push([nx, ny, path.concat([{ x: nx, y: ny }])]);
        }
      }
    }

    // no path found
    return [];
  }
}

module.exports = { AiEntity };