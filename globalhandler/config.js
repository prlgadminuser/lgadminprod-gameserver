"use strict";

const { gamemodeconfig, allowed_gamemodes } = require('./../gameconfig/gamemodes')
const { mapsconfig } = require('./../gameconfig/maps')
const { gunsconfig } = require('./../gameconfig/guns')
const { matchmakingsp } = require('./../gameconfig/matchmaking')

const gridcellsize = 40;
const server_tick_rate = 16.4 //17
const player_idle_timeout = 10000
const maxClients = 100;

const matchmaking_timeout = 1800000 // 30 minutes max matchmaking time
const game_start_time = 1000
const game_win_rest_time = 10000
const room_max_open_time = 600000 // if game begins room can be opened for max 10 minutes before being auto closed by interval


const playerhitbox = {
  xMin: 14,
  xMax: 14,
  yMin: 49, //59
  yMax: 49, //49
}

const playerHitboxWidth = 22;
const playerHitboxHeight = 47;

const validDirections = new Set([-90, 0, 180, -180, 90, 45, 135, -135, -45]);

const isValidDirection = (direction) => {
  return validDirections.has(direction);
};


class SpatialGrid {
  constructor(cellSize) {
    this.cellSize = cellSize;

    this.grid = new Map();
  }


  _getCellKey(x, y) {
    const cellX = Math.floor(x / this.cellSize);
    const cellY = Math.floor(y / this.cellSize);
    return `${cellX}_${cellY}`;
  }

  addObject(obj) {
    if (typeof obj.x !== 'number' || typeof obj.y !== 'number' || !obj.id) {
      throw new Error("Object must have numeric 'x', 'y' and a unique 'id' property.");
    }

    const key = this._getCellKey(obj.x, obj.y);

    let cell = this.grid.get(key);
    if (!cell) {
      cell = new Map(); // Use a Map for fast O(1) lookups
      this.grid.set(key, cell);
    }

    cell.set(obj.id, obj);
    obj._gridKey = key;
  }

  removeObject(obj) {
    if (!obj || !obj._gridKey) {
      return;
    }

    const cell = this.grid.get(obj._gridKey);
    if (cell) {
      cell.delete(obj.id);

      if (cell.size === 0) {
        this.grid.delete(obj._gridKey);
      }
    }

    delete obj._gridKey;
  }

  updateObject(obj, newX, newY) {
    const oldKey = obj._gridKey;
    const newKey = this._getCellKey(newX, newY);

    if (oldKey === newKey) {
      obj.x = newX;
      obj.y = newY;
      return;
    }

    this.removeObject(obj);
    obj.x = newX;
    obj.y = newY;
    this.addObject(obj);
  }


  getObjectsInArea(xMin, xMax, yMin, yMax) {

    const keys = this._getKeysInArea(xMin, xMax, yMin, yMax);

    const result = [];

    for (const key of keys) {
      const cell = this.grid.get(key);
      if (cell) {
        result.push(...cell);
      }
    }
    return result;
  }

  _getKeysInArea(xMin, xMax, yMin, yMax) {

    const keys = [];

    const startX = Math.floor(xMin / this.cellSize);
    const endX = Math.floor(xMax / this.cellSize);
    const startY = Math.floor(yMin / this.cellSize);
    const endY = Math.floor(yMax / this.cellSize);

    for (let x = startX; x <= endX; x++) {

      for (let y = startY; y <= endY; y++) {

        keys.push(`${x},${y}`);
      }
    }
    return keys;

  }




  _ensureCell(key) {
    if (!this.grid.has(key)) {
      this.grid.set(key, new Set());
    }
  }

  _addToCell(obj) {
    const key = this._getCellKey(obj.x, obj.y);
    this._ensureCell(key);
    this.grid.get(key).add(obj);
  }

  _removeFromCell(obj, compareById = false) {
    const key = this._getCellKey(obj.x, obj.y);
    const cell = this.grid.get(key);
    if (!cell) return;

    if (compareById && obj.obj_id) {
      for (const item of cell) {
        if (item.obj_id === obj.obj_id) {
          cell.delete(item);
          break;
        }
      }
    } else {
      cell.delete(obj);
    }

    if (cell.size === 0) {
      this.grid.delete(key);
    }
  }



  addWall(wall) {
    this._addToCell(wall);
  }

  removeWall(wall) {
    this._removeFromCell(wall, false);
  }

  removeWallAt(x, y) {
    const key = this._getCellKey(x, y);
    const cell = this.grid.get(key);
    if (!cell) return;

    for (const obj of cell) {
      if (obj.x === x && obj.y === y) {
        cell.delete(obj);
        break; // Only remove one matching wall
      }
    }

    if (cell.size === 0) {
      this.grid.delete(key);
    }
  }

  addWallAt(x, y) {
    const key = this._getCellKey(x, y);
    let cell = this.grid.get(key);

    if (!cell) {
      cell = new Set();
      this.grid.set(key, cell);
    }

    // Check if a wall at this position already exists
    for (const obj of cell) {
      if (obj.x === x && obj.y === y) {
        return; // Wall already exists, do nothing
      }
    }

    // Add a new wall object
    cell.add({ x, y });
  }

  getObjectsInAreaWithId(xMin, xMax, yMin, yMax, id) {
    const keys = this._getKeysInArea(xMin, xMax, yMin, yMax);
    const result = [];

    for (const key of keys) {
      const cell = this.grid.get(key);
      if (cell) {
        for (const obj of cell) {
          if (obj.id === id) result.push(obj);
        }
      }
    }

    return result;
  }


  getWallsInArea(xMin, xMax, yMin, yMax) {
    // Same logic as getObjectsInArea
    return this.getObjectsInArea(xMin, xMax, yMin, yMax);
  }

}

// Initialize grids for all maps
// Adjust as necessary
mapsconfig.forEach((map, mapKey) => {
  const grid = new SpatialGrid(gridcellsize);

  map.walls.forEach((wall, index) => {
    // Assign a unique ID to each wall for O(1) lookups
    const wallWithId = { ...wall, id: `wall_${index}` };
    grid.addObject(wallWithId);
  });



  map.grid = grid;

  console.log("cloning map:", mapKey)
});

module.exports = {
  server_tick_rate,
  matchmaking_timeout,
  player_idle_timeout,
  game_start_time,
  game_win_rest_time,
  maxClients,
  isValidDirection,
  playerHitboxWidth,
  playerHitboxHeight,
  gunsconfig,
  mapsconfig,
  matchmakingsp,
  gamemodeconfig,
  allowed_gamemodes,
  room_max_open_time,
  SpatialGrid,
  gridcellsize,
  playerhitbox,
};
