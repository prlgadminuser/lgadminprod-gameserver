"use strict";

const { gamemodeconfig } = require('./../gameconfig/gamemodes')
const { mapsconfig } = require('./../gameconfig/maps')
const { gunsconfig } = require('./../gameconfig/guns')
const { matchmaking, matchmakingsp } = require('./../gameconfig/matchmaking')

const rooms = new Map();

const gridcellsize = 200; 
const server_tick_rate = 16.4 //17
const matchmaking_timeout = 120000
const player_idle_timeout = 10000
const game_start_time = 1000
const game_win_rest_time = 10000
const room_max_open_time = 600000 //600000
const maxClients = 100;

const playerhitbox = {
  xMin: 14,
  xMax: 14,
  yMin: 49, //59
  yMax: 49, //49
  }

const playerHitboxWidth = 45; 
const playerHitboxHeight = 120;

const validDirections = [-90, 0, 180, -180, 90, 45, 135, -135, -45];

const isValidDirection = (direction) => {
return validDirections.includes(direction);
  };

const teleporters = [
  { x: 700, y: 0, width: 50, height: 50, destination: { x: -700, y: 0 } },// Example teleporter
  // Add more teleporters as needed
];



class SpatialGrid {
  constructor(gridcellsize) {
    this.cellSize = gridcellsize;
    this.grid = new Map();
  }

  _getCellKey(x, y) {
    const cellX = Math.floor(x / this.cellSize);
    const cellY = Math.floor(y / this.cellSize);
    return `${cellX},${cellY}`;
  }

  addObject(obj) {
    const key = this._getCellKey(obj.x, obj.y);
    if (!this.grid.has(key)) {
      this.grid.set(key, []);
    }
    this.grid.get(key).push(obj);
  }

  removeObject(obj) {
    if (!obj.obj_id) {
      throw new Error("Object must have an 'obj_id' property to be removed.");
    }
  
    const key = this._getCellKey(obj.x, obj.y);
    if (this.grid.has(key)) {
      const cell = this.grid.get(key);
      // Find the index of the object to be removed using obj_id
      const index = cell.findIndex(item => item.obj_id === obj.obj_id);
      if (index !== -1) {
        cell.splice(index, 1);
        // If the cell becomes empty, delete it from the grid
        if (cell.length === 0) {
          this.grid.delete(key);
        }
      }
    }
  }
  





  addWall(wall) {
    const key = this._getCellKey(wall.x, wall.y);
    if (!this.grid.has(key)) {
      this.grid.set(key, []);
    }
    this.grid.get(key).push(wall);
  }

  getObjectsInAreaWithId(xMin, xMax, yMin, yMax, id) {
    const objects = [];
    const startX = Math.floor(xMin / this.cellSize);
    const endX = Math.floor(xMax / this.cellSize);
    const startY = Math.floor(yMin / this.cellSize);
    const endY = Math.floor(yMax / this.cellSize);

    for (let x = startX; x <= endX; x++) {
      for (let y = startY; y <= endY; y++) {
        const key = `${x},${y}`;
        if (this.grid.has(key)) {
          const cellObjects = this.grid.get(key);
          // Filter by ID if provided
          const filteredObjects = cellObjects.filter(obj => obj.id === id);
          objects.push(...filteredObjects);
        }
      }
    }
    return objects;
  }

  getObjectsInArea(xMin, xMax, yMin, yMax) {
    const objects = [];
    const startX = Math.floor(xMin / this.cellSize);
    const endX = Math.floor(xMax / this.cellSize);
    const startY = Math.floor(yMin / this.cellSize);
    const endY = Math.floor(yMax / this.cellSize);

    for (let x = startX; x <= endX; x++) {
      for (let y = startY; y <= endY; y++) {
        const key = `${x},${y}`;
        if (this.grid.has(key)) {
          objects.push(...this.grid.get(key));
        }
      }
    }
    return objects;
  }


  getWallsInArea(xMin, xMax, yMin, yMax) {
    const walls = [];
    const startX = Math.floor(xMin / this.cellSize);
    const endX = Math.floor(xMax / this.cellSize);
    const startY = Math.floor(yMin / this.cellSize);
    const endY = Math.floor(yMax / this.cellSize);

    for (let x = startX; x <= endX; x++) {
      for (let y = startY; y <= endY; y++) {
        const key = `${x},${y}`;
        if (this.grid.has(key)) {
          walls.push(...this.grid.get(key));
        }
      }
    }
    return walls;
  }
}

// Initialize grids for all maps
// Adjust as necessary
Object.keys(mapsconfig).forEach(mapKey => {
  const map = mapsconfig[mapKey];
  const grid = new SpatialGrid(gridcellsize);

  map.walls.forEach(wall => grid.addWall(wall));

  // Save the grid in the map configuration
  map.grid = grid;
});


function extractWallCoordinates(mapConfig) {
  return mapConfig.walls.map(({ x, y }) => ({ x, y }));
}

const transformedMaps = Object.keys(mapsconfig).reduce((acc, key) => {
  acc[key] = extractWallCoordinates(mapsconfig[key]);
  return acc;
}, {});




//helper functions for grid retrival

module.exports = {
  server_tick_rate,
  matchmaking_timeout,
  player_idle_timeout,
  game_start_time,
  game_win_rest_time,
  maxClients,
  isValidDirection,
  teleporters,
  playerHitboxWidth, 
  playerHitboxHeight,
  gunsconfig,
  mapsconfig,
  matchmakingsp,
  gamemodeconfig,
  rooms,
  room_max_open_time,
  SpatialGrid,
  gridcellsize,
  playerhitbox,
};
