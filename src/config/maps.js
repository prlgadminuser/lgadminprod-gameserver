
const { GameGrid } = require("./grid");

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
    walls: [{"x":30,"y":0,"type":"3","walkable":"false","effect":"value"},{"x":30,"y":30,"type":"3","walkable":"false","effect":"value"},{"x":30,"y":-30,"type":"3","walkable":"false","effect":"value"},{"x":90,"y":-60,"type":"3","walkable":"false","effect":"value"},{"x":-30,"y":-30,"type":"3","walkable":"false","effect":"value"},{"x":-30,"y":0,"type":"3","walkable":"false","effect":"value"},{"x":-30,"y":30,"type":"3","walkable":"false","effect":"value"},{"x":-60,"y":0,"type":"3","walkable":"false","effect":"value"},{"x":60,"y":0,"type":"3","walkable":"false","effect":"value"},{"x":-90,"y":-60,"type":"3","walkable":"false","effect":"value"},{"x":-90,"y":60,"type":"3","walkable":"false","effect":"value"},{"x":90,"y":60,"type":"3","walkable":"false","effect":"value"},{"x":0,"y":-120,"type":"3","walkable":"false","effect":"value"},{"x":0,"y":120,"type":"3","walkable":"false","effect":"value"}],
      width: 400,
      height: 500,
      spawns: [
        {"x":-0,"y":0},
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

  const grid = new GameGrid(map.width, map.height);
  map.walls.forEach((wall, index) => {

    wall.objectType = "wall"
   
    const wallWithId = { 
      ...wall, 
      id: `${index}`, 
    //  hitboxtype: "circle",
      width: 30,
      height: 30,
      walkable: wall.walkable === "true", // walkable means that this is not an obstacle so the player can walk through. this is for example an gras block 
    };



    if (!wallWithId.walkable) grid.addObject(wallWithId);

    const walkableFlag = wall.walkable === "true" ? 1 : 0

    const wallWithIdCompressed = [
       wall.x / wallWithId.height,
       wall.y / wallWithId.width,
       Number(wall.type),
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