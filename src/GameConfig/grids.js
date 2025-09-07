

const gridcellsize = 40;

class NotSeenNearbyObjectsGrid {
  constructor(cellSize) {
    this.cellSize = cellSize;
    this.grid = new Map(); // Key: "cellX,cellY" → Set of objects
    this.nextId = 1;   
  }

  getCellKey(x, y) {
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

   obj.id = this.nextId++;

    const key = this.getCellKey(obj.x, obj.y);
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
    const newKey = this.getCellKey(newX, newY);

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

    getObjectsInAreaStatic(xMin, xMax, yMin, yMax, excludeSeenIds, resultArray) {
    const keys = this._getKeysInArea(xMin, xMax, yMin, yMax);
    const result = resultArray || [];

    // If resultArray is passed, clear it first
    if (resultArray) resultArray.length = 0;

    for (let i = 0; i < keys.length; i++) {
      const set = this.grid.get(keys[i]);
      if (set) {
        for (const obj of set) {
          if (!excludeSeenIds || !excludeSeenIds.has(obj.id)) {
            result.push(obj);
          }
        }
      }
    }

    return result;
  }
}




class RealTimeObjectGrid {
  constructor(cellSize) {
    this.cellSize = cellSize;
    this.grid = new Map(); // Key: "cellX,cellY" → Set of objects
  }

  getCellKey(x, y) {
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

    const key = this.getCellKey(obj.x, obj.y);
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
    const newKey = this.getCellKey(newX, newY);

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

  getCellKey(x, y) {
    const cellX = Math.floor(x / this.cellSize);
    const cellY = Math.floor(y / this.cellSize);
    return `${cellX},${cellY}`;
  }

  addObject(obj) {
    if (typeof obj.x !== 'number' || typeof obj.y !== 'number') {
      throw new Error("Object must have numeric 'x', 'y' and a unique 'id' property.");
    }
    const key = this.getCellKey(obj.x, obj.y);
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
    const newKey = this.getCellKey(newX, newY);
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


module.exports = { gridcellsize, RealTimeObjectGrid, SpatialGrid, NotSeenNearbyObjectsGrid }