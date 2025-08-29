"use strict";

const { gamemodeconfig, allowed_gamemodes } = require('./../gameconfig/gamemodes');
const { mapsconfig, random_mapkeys } = require('./../gameconfig/maps');
const { gunsconfig } = require('./../gameconfig/guns');
const { matchmakingsp } = require('./../gameconfig/matchmaking');

const gridcellsize = 40;

const TICK_RATE = 60
const server_tick_rate =  1000 / TICK_RATE;
const player_idle_timeout = 10000;
const maxClients = 100;

const matchmaking_timeout = 30 * 60 * 1000; // 30 mins
const game_start_time = 1000;
const game_win_rest_time = 10000;
const room_max_open_time = 10 * 60 * 1000; // 10 mins

const playerhitbox = {
  xMin: 14,
  xMax: 14,
  yMin: 49,
  yMax: 49,
};

const playerHitboxWidth = 22;
const playerHitboxHeight = 47;

const validDirections = new Set([-90, 0, 180, -180, 90, 45, 135, -135, -45]);
const isValidDirection = (direction) => validDirections.has(direction);

class RealTimeObjectGrid {
  constructor(cellSize) {
    this.cellSize = cellSize;
    this.grid = new Map(); // Key: "cellX,cellY" → Set of objects
  }

  _getCellKey(x, y) {
    const cellX = Math.floor(x / this.cellSize);
    const cellY = Math.floor(y / this.cellSize);
    return `${cellX},${cellY}`;
  }

  addObject(obj) {
  
    if (!obj.position) {
    if (typeof obj.x !== 'number' || typeof obj.y !== 'number') {
      throw new Error("Object must have numeric 'x' and 'y' properties.");
    }
  }

    const key = this._getCellKey(obj.x, obj.y);
    if (!this.grid.has(key)) {
      this.grid.set(key, new Set());
    }

    this.grid.get(key).add(obj);
    obj._gridKey = key;
  }

  removeObject(obj) {
    if (!obj || !obj._gridKey) return;

    const set = this.grid.get(obj._gridKey);
    if (set) {
      set.delete(obj);
      if (set.size === 0) {
        this.grid.delete(obj._gridKey);
      }
    }

    delete obj._gridKey;
  }

  updateObject(obj, newX, newY) {
    const newKey = this._getCellKey(newX, newY);

    if (obj._gridKey !== newKey) {
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
  return !!obj._gridKey && this.grid.has(obj._gridKey) && this.grid.get(obj._gridKey).has(obj);
}

  getObjectsInArea(xMin, xMax, yMin, yMax) {
    const result = [];
    const keys = this._getKeysInArea(xMin, xMax, yMin, yMax);

    for (const key of keys) {
      const set = this.grid.get(key);
      if (set) {
        for (const obj of set) {
          result.push(obj);
        }
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
}


class SpatialGrid {
  constructor(cellSize) {
    this.cellSize = cellSize;
    this.grid = new Map(); // Key: "cellX,cellY" → object
  }

  _getCellKey(x, y) {
    const cellX = Math.floor(x / this.cellSize);
    const cellY = Math.floor(y / this.cellSize);
    return `${cellX},${cellY}`;
  }

  addObject(obj) {
    if (typeof obj.x !== 'number' || typeof obj.y !== 'number') {
      throw new Error("Object must have numeric 'x', 'y' and a unique 'id' property.");
    }
    const key = this._getCellKey(obj.x, obj.y);
    this.grid.set(key, obj);
    obj._gridKey = key;
  }

  removeObject(obj) {
    if (!obj || !obj._gridKey) return;
    this.grid.delete(obj._gridKey);
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
      const obj = this.grid.get(key);
      if (obj) result.push(obj);
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
}

// Initialize maps with one-wall-per-cell
mapsconfig.forEach((map, mapKey) => {

  const grid = new SpatialGrid(gridcellsize);
  map.walls.forEach((wall, index) => {
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
  random_mapkeys,
  matchmakingsp,
  gamemodeconfig,
  allowed_gamemodes,
  room_max_open_time,
  SpatialGrid,
  RealTimeObjectGrid,
  gridcellsize,
  playerhitbox,
};
