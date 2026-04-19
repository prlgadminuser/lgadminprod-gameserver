
const { getRandomNumber } = require("../utils/math");
const { GameGrid } = require("./grid");

function generateMap(mapWidth = 300, mapHeight = 300, tileSize = 30, wallChance = 0.25) {
  const walls = [];

  const cols = Math.floor(mapWidth / tileSize);
  const rows = Math.floor(mapHeight / tileSize);

  const offsetX = (cols / 2) * tileSize;
  const offsetY = (rows / 2) * tileSize;

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {

      const worldX = x * tileSize - offsetX;
      const worldY = y * tileSize - offsetY;

      const isBorder =
        x === 0 || y === 0 ||
        x === cols - 1 || y === rows - 1;

      const isWall = isBorder || Math.random() < wallChance;

      if (isWall) {
        walls.push({
          x: worldX,
          y: worldY,
          type: Math.round(getRandomNumber(1,3)),
          walkable: false,
          effect: "value"
        });
      }
    }
  }

  return walls;
}


const walls = generateMap()


let mapsconfig = {

   devtest: {
      walls: [], // for testing no wall
      width: 800,
      height: 800,
      spawns: [
        { x: 0, y: 0 },
        { x: 0, y: -700 },
        { x: 300, y: 300 },
        { x: 400, y: 400 },
        { x: 400, y: 450 },
      ]  
    },

   training: {
    walls: walls, //[{"x":30,"y":0,"type":"3","walkable":"false","effect":"value"}],// {"x":47,"y":12,"type":"3","walkable":"false","effect":"value"}],
      width: 230,
      height: 300,
      spawns: [
        {"x":0,"y":200},
        {"x":0,"y":200},
        {"x":0,"y":-200},
        {"x":0,"y":-200},
        {"x":200,"y":0},
         {"x":200,"y":0},
      ],
      dummies: {
        a1: { x: 100, y: 0, health: 100, starthealth: 100, type: 1 },
        a2: { x: 300, y: 0, health: 100, starthealth: 100, type: 1 },
        b3: { x: -100, y: 0, health: 500, starthealth: 500, type: 2 },
        b4: { x: -200, y: -400, health: 500, starthealth: 500, type: 2 },
      },
    },

    skilloween: {
      walls: [],
      width: 1000,
      height: 1000,
      spawns: [
        { x: 0, y: 0 },
        { x: 0, y: -700 },
        { x: 300, y: 300 },
        { x: 400, y: 400 },
        { x: 400, y: 450 },
      ]  
    },
    
    1: {
      walls: [],
      width: 800,
      height: 800,
      spawns: [
        { x: 0, y: 0 },
        { x: 0, y: -700 },
        { x: 300, y: 300 },
        { x: 400, y: 400 },
        { x: 400, y: 450 },
      ]  
    },
  
  };

  mapsconfig =  new Map(Object.entries(mapsconfig))
// pre render grid
  mapsconfig.forEach((map) => {



 map.compressedwalls = []

 //map.walls = generateMap(map.width * 2, map.height * 2)

  const grid = new GameGrid(map.width, map.height)
  map.walls.forEach((wall, index) => {

    wall.objectType = "wall"
   
    const wallWithId = { 
      ...wall, 
      id: `${index}`, 
    //  hitboxtype: "circle",
      width: 30,
      height: 30,
      walkable: wall.walkable === "true", // walkable means that this is not an obstacle so the player can walk through. this is for example an gras block 
      position: {
        x: wall.x,
        y: wall.y,
      }
    };



    if (!wallWithId.walkable) grid.addObject(wallWithId);

    const walkableFlag = wall.walkable === "true" ? 1 : 0

    const wallWithIdCompressed = [
       wall.x / wallWithId.height,
       wall.y / wallWithId.width,
       Number(wall.type),
       wallWithId.id
      // walkableFlag
      // wall.effect
    ]

     map.compressedwalls.push(wallWithIdCompressed);

  
  });
  map.grid = grid;
});

  module.exports = {
     mapsconfig,
     random_mapkeys: Array.from(Object.keys(mapsconfig)).slice(0, -2)

}
