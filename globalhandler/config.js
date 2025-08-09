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

    // Add the object to the cell using its ID as the key for O(1) lookup
    cell.set(obj.id, obj);
    
    // Store the cell key on the object for O(1) removal/movement
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
    const result = [];
    const keys = this._getKeysInArea(xMin, xMax, yMin, yMax);

    for (const key of keys) {
      const cell = this.grid.get(key);
      if (cell) {
        result.push(...cell.values());
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
        keys.push(`${x}_${y}`);
      }
    }
    return keys;
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
