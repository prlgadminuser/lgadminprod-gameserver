
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
    walls: [{"x":90,"y":-60,"type":"3","walkable":"false","effect":"value"},{"x":-60,"y":0,"type":"3","walkable":"false","effect":"value"},{"x":-90,"y":-60,"type":"3","walkable":"false","effect":"value"},{"x":-90,"y":60,"type":"3","walkable":"false","effect":"value"},{"x":90,"y":60,"type":"3","walkable":"false","effect":"value"},{"x":0,"y":-120,"type":"3","walkable":"false","effect":"value"},{"x":0,"y":120,"type":"3","walkable":"false","effect":"value"},{"x":120,"y":30,"type":"3","walkable":"false","effect":"value"},{"x":150,"y":30,"type":"3","walkable":"false","effect":"value"},{"x":120,"y":60,"type":"3","walkable":"false","effect":"value"},{"x":-120,"y":60,"type":"3","walkable":"false","effect":"value"},{"x":-120,"y":30,"type":"3","walkable":"false","effect":"value"},{"x":-120,"y":0,"type":"3","walkable":"false","effect":"value"},{"x":-90,"y":0,"type":"3","walkable":"false","effect":"value"},{"x":-90,"y":30,"type":"3","walkable":"false","effect":"value"},{"x":-120,"y":-30,"type":"3","walkable":"false","effect":"value"},{"x":-90,"y":-30,"type":"3","walkable":"false","effect":"value"},{"x":-120,"y":-60,"type":"3","walkable":"false","effect":"value"},{"x":-120,"y":-90,"type":"3","walkable":"false","effect":"value"},{"x":-90,"y":-90,"type":"3","walkable":"false","effect":"value"},{"x":-90,"y":-120,"type":"3","walkable":"false","effect":"value"},{"x":-60,"y":-120,"type":"3","walkable":"false","effect":"value"},{"x":-60,"y":-150,"type":"3","walkable":"false","effect":"value"},{"x":-30,"y":-150,"type":"3","walkable":"false","effect":"value"},{"x":-60,"y":-90,"type":"3","walkable":"false","effect":"value"},{"x":-120,"y":-120,"type":"3","walkable":"false","effect":"value"},{"x":-120,"y":-150,"type":"3","walkable":"false","effect":"value"},{"x":-90,"y":-150,"type":"3","walkable":"false","effect":"value"},{"x":-120,"y":-180,"type":"3","walkable":"false","effect":"value"},{"x":-90,"y":-180,"type":"3","walkable":"false","effect":"value"},{"x":-60,"y":-180,"type":"3","walkable":"false","effect":"value"},{"x":-30,"y":-180,"type":"3","walkable":"false","effect":"value"},{"x":0,"y":-150,"type":"3","walkable":"false","effect":"value"},{"x":0,"y":-180,"type":"3","walkable":"false","effect":"value"},{"x":-90,"y":-210,"type":"3","walkable":"false","effect":"value"},{"x":-60,"y":-210,"type":"3","walkable":"false","effect":"value"},{"x":-30,"y":-210,"type":"3","walkable":"false","effect":"value"},{"x":0,"y":-210,"type":"3","walkable":"false","effect":"value"},{"x":30,"y":-210,"type":"3","walkable":"false","effect":"value"},{"x":30,"y":-180,"type":"3","walkable":"false","effect":"value"},{"x":30,"y":-150,"type":"3","walkable":"false","effect":"value"},{"x":60,"y":-120,"type":"3","walkable":"false","effect":"value"},{"x":90,"y":-120,"type":"3","walkable":"false","effect":"value"},{"x":60,"y":-150,"type":"3","walkable":"false","effect":"value"},{"x":30,"y":-120,"type":"3","walkable":"false","effect":"value"},{"x":90,"y":-150,"type":"3","walkable":"false","effect":"value"},{"x":60,"y":-210,"type":"3","walkable":"false","effect":"value"},{"x":90,"y":-210,"type":"3","walkable":"false","effect":"value"},{"x":60,"y":-180,"type":"3","walkable":"false","effect":"value"},{"x":120,"y":-180,"type":"3","walkable":"false","effect":"value"},{"x":150,"y":-180,"type":"3","walkable":"false","effect":"value"},{"x":150,"y":-150,"type":"3","walkable":"false","effect":"value"},{"x":120,"y":-120,"type":"3","walkable":"false","effect":"value"},{"x":150,"y":-120,"type":"3","walkable":"false","effect":"value"},{"x":180,"y":-90,"type":"3","walkable":"false","effect":"value"},{"x":180,"y":-60,"type":"3","walkable":"false","effect":"value"},{"x":180,"y":-30,"type":"3","walkable":"false","effect":"value"},{"x":210,"y":-30,"type":"3","walkable":"false","effect":"value"},{"x":240,"y":-30,"type":"3","walkable":"false","effect":"value"},{"x":210,"y":-60,"type":"3","walkable":"false","effect":"value"},{"x":210,"y":-90,"type":"3","walkable":"false","effect":"value"},{"x":300,"y":-90,"type":"3","walkable":"false","effect":"value"},{"x":300,"y":-30,"type":"3","walkable":"false","effect":"value"},{"x":270,"y":0,"type":"3","walkable":"false","effect":"value"},{"x":270,"y":30,"type":"3","walkable":"false","effect":"value"},{"x":270,"y":60,"type":"3","walkable":"false","effect":"value"},{"x":210,"y":90,"type":"3","walkable":"false","effect":"value"},{"x":270,"y":120,"type":"3","walkable":"false","effect":"value"},{"x":180,"y":120,"type":"3","walkable":"false","effect":"value"},{"x":270,"y":150,"type":"3","walkable":"false","effect":"value"},{"x":240,"y":180,"type":"3","walkable":"false","effect":"value"},{"x":180,"y":270,"type":"3","walkable":"false","effect":"value"},{"x":240,"y":270,"type":"3","walkable":"false","effect":"value"},{"x":300,"y":240,"type":"3","walkable":"false","effect":"value"},{"x":330,"y":240,"type":"3","walkable":"false","effect":"value"},{"x":270,"y":330,"type":"3","walkable":"false","effect":"value"},{"x":330,"y":330,"type":"3","walkable":"false","effect":"value"},{"x":360,"y":330,"type":"3","walkable":"false","effect":"value"},{"x":360,"y":390,"type":"3","walkable":"false","effect":"value"},{"x":330,"y":420,"type":"3","walkable":"false","effect":"value"},{"x":360,"y":420,"type":"3","walkable":"false","effect":"value"},{"x":270,"y":420,"type":"3","walkable":"false","effect":"value"},{"x":300,"y":450,"type":"3","walkable":"false","effect":"value"},{"x":300,"y":480,"type":"3","walkable":"false","effect":"value"},{"x":240,"y":480,"type":"3","walkable":"false","effect":"value"},{"x":210,"y":510,"type":"3","walkable":"false","effect":"value"},{"x":180,"y":480,"type":"3","walkable":"false","effect":"value"},{"x":360,"y":510,"type":"3","walkable":"false","effect":"value"},{"x":210,"y":390,"type":"3","walkable":"false","effect":"value"},{"x":90,"y":420,"type":"3","walkable":"false","effect":"value"},{"x":90,"y":450,"type":"3","walkable":"false","effect":"value"},{"x":120,"y":480,"type":"3","walkable":"false","effect":"value"},{"x":0,"y":480,"type":"3","walkable":"false","effect":"value"},{"x":0,"y":450,"type":"3","walkable":"false","effect":"value"},{"x":60,"y":420,"type":"3","walkable":"false","effect":"value"},{"x":90,"y":390,"type":"3","walkable":"false","effect":"value"},{"x":90,"y":330,"type":"3","walkable":"false","effect":"value"},{"x":30,"y":360,"type":"3","walkable":"false","effect":"value"},{"x":-60,"y":420,"type":"3","walkable":"false","effect":"value"},{"x":-90,"y":450,"type":"3","walkable":"false","effect":"value"},{"x":-120,"y":390,"type":"3","walkable":"false","effect":"value"},{"x":-30,"y":330,"type":"3","walkable":"false","effect":"value"},{"x":0,"y":330,"type":"3","walkable":"false","effect":"value"},{"x":0,"y":360,"type":"3","walkable":"false","effect":"value"},{"x":30,"y":300,"type":"3","walkable":"false","effect":"value"},{"x":90,"y":360,"type":"3","walkable":"false","effect":"value"},{"x":150,"y":300,"type":"3","walkable":"false","effect":"value"},{"x":150,"y":240,"type":"3","walkable":"false","effect":"value"},{"x":90,"y":240,"type":"3","walkable":"false","effect":"value"},{"x":150,"y":180,"type":"3","walkable":"false","effect":"value"},{"x":90,"y":180,"type":"3","walkable":"false","effect":"value"},{"x":60,"y":180,"type":"3","walkable":"false","effect":"value"},{"x":0,"y":240,"type":"3","walkable":"false","effect":"value"},{"x":-30,"y":270,"type":"3","walkable":"false","effect":"value"},{"x":-150,"y":300,"type":"3","walkable":"false","effect":"value"},{"x":-120,"y":300,"type":"3","walkable":"false","effect":"value"},{"x":-240,"y":360,"type":"3","walkable":"false","effect":"value"},{"x":-210,"y":360,"type":"3","walkable":"false","effect":"value"},{"x":-240,"y":390,"type":"3","walkable":"false","effect":"value"},{"x":-270,"y":420,"type":"3","walkable":"false","effect":"value"},{"x":-300,"y":390,"type":"3","walkable":"false","effect":"value"},{"x":-330,"y":360,"type":"3","walkable":"false","effect":"value"},{"x":-210,"y":270,"type":"3","walkable":"false","effect":"value"},{"x":-180,"y":270,"type":"3","walkable":"false","effect":"value"},{"x":-150,"y":240,"type":"3","walkable":"false","effect":"value"},{"x":-180,"y":210,"type":"3","walkable":"false","effect":"value"},{"x":-240,"y":210,"type":"3","walkable":"false","effect":"value"},{"x":-210,"y":180,"type":"3","walkable":"false","effect":"value"},{"x":-240,"y":180,"type":"3","walkable":"false","effect":"value"},{"x":-60,"y":210,"type":"3","walkable":"false","effect":"value"},{"x":-150,"y":210,"type":"3","walkable":"false","effect":"value"},{"x":-120,"y":150,"type":"3","walkable":"false","effect":"value"},{"x":-180,"y":150,"type":"3","walkable":"false","effect":"value"},{"x":-300,"y":180,"type":"3","walkable":"false","effect":"value"},{"x":-330,"y":180,"type":"3","walkable":"false","effect":"value"},{"x":-270,"y":120,"type":"3","walkable":"false","effect":"value"},{"x":-240,"y":90,"type":"3","walkable":"false","effect":"value"},{"x":-270,"y":60,"type":"3","walkable":"false","effect":"value"},{"x":-300,"y":60,"type":"3","walkable":"false","effect":"value"},{"x":-210,"y":-30,"type":"3","walkable":"false","effect":"value"},{"x":-300,"y":-30,"type":"3","walkable":"false","effect":"value"},{"x":-330,"y":-60,"type":"3","walkable":"false","effect":"value"},{"x":-270,"y":-120,"type":"3","walkable":"false","effect":"value"},{"x":-240,"y":-150,"type":"3","walkable":"false","effect":"value"},{"x":-300,"y":-150,"type":"3","walkable":"false","effect":"value"},{"x":-330,"y":-150,"type":"3","walkable":"false","effect":"value"},{"x":-270,"y":-150,"type":"3","walkable":"false","effect":"value"},{"x":-210,"y":-60,"type":"3","walkable":"false","effect":"value"},{"x":-210,"y":-120,"type":"3","walkable":"false","effect":"value"},{"x":-210,"y":-150,"type":"3","walkable":"false","effect":"value"},{"x":-180,"y":-180,"type":"3","walkable":"false","effect":"value"},{"x":-210,"y":-210,"type":"3","walkable":"false","effect":"value"},{"x":-270,"y":-240,"type":"3","walkable":"false","effect":"value"},{"x":-300,"y":-270,"type":"3","walkable":"false","effect":"value"},{"x":-270,"y":-300,"type":"3","walkable":"false","effect":"value"},{"x":-240,"y":-330,"type":"3","walkable":"false","effect":"value"},{"x":-210,"y":-330,"type":"3","walkable":"false","effect":"value"},{"x":-150,"y":-300,"type":"3","walkable":"false","effect":"value"},{"x":-270,"y":-360,"type":"3","walkable":"false","effect":"value"},{"x":-240,"y":-390,"type":"3","walkable":"false","effect":"value"},{"x":-210,"y":-360,"type":"3","walkable":"false","effect":"value"},{"x":-150,"y":-330,"type":"3","walkable":"false","effect":"value"},{"x":-120,"y":-330,"type":"3","walkable":"false","effect":"value"},{"x":-90,"y":-330,"type":"3","walkable":"false","effect":"value"},{"x":-180,"y":-420,"type":"3","walkable":"false","effect":"value"},{"x":-240,"y":-450,"type":"3","walkable":"false","effect":"value"},{"x":-270,"y":-480,"type":"3","walkable":"false","effect":"value"},{"x":-300,"y":-480,"type":"3","walkable":"false","effect":"value"},{"x":-330,"y":-420,"type":"3","walkable":"false","effect":"value"},{"x":-360,"y":-420,"type":"3","walkable":"false","effect":"value"},{"x":-300,"y":-300,"type":"3","walkable":"false","effect":"value"},{"x":-330,"y":-270,"type":"3","walkable":"false","effect":"value"},{"x":-360,"y":-240,"type":"3","walkable":"false","effect":"value"},{"x":-90,"y":-300,"type":"3","walkable":"false","effect":"value"},{"x":-30,"y":-390,"type":"3","walkable":"false","effect":"value"},{"x":-60,"y":-450,"type":"3","walkable":"false","effect":"value"},{"x":-90,"y":-480,"type":"3","walkable":"false","effect":"value"},{"x":-120,"y":-390,"type":"3","walkable":"false","effect":"value"},{"x":-90,"y":-390,"type":"3","walkable":"false","effect":"value"},{"x":0,"y":-480,"type":"3","walkable":"false","effect":"value"},{"x":30,"y":-390,"type":"3","walkable":"false","effect":"value"},{"x":30,"y":-360,"type":"3","walkable":"false","effect":"value"},{"x":90,"y":-330,"type":"3","walkable":"false","effect":"value"},{"x":90,"y":-300,"type":"3","walkable":"false","effect":"value"},{"x":30,"y":-270,"type":"3","walkable":"false","effect":"value"},{"x":90,"y":-270,"type":"3","walkable":"false","effect":"value"},{"x":150,"y":-270,"type":"3","walkable":"false","effect":"value"},{"x":180,"y":-330,"type":"3","walkable":"false","effect":"value"},{"x":150,"y":-390,"type":"3","walkable":"false","effect":"value"},{"x":120,"y":-420,"type":"3","walkable":"false","effect":"value"},{"x":150,"y":-480,"type":"3","walkable":"false","effect":"value"},{"x":180,"y":-510,"type":"3","walkable":"false","effect":"value"},{"x":240,"y":-450,"type":"3","walkable":"false","effect":"value"},{"x":270,"y":-420,"type":"3","walkable":"false","effect":"value"},{"x":240,"y":-360,"type":"3","walkable":"false","effect":"value"},{"x":240,"y":-300,"type":"3","walkable":"false","effect":"value"},{"x":210,"y":-270,"type":"3","walkable":"false","effect":"value"},{"x":240,"y":-240,"type":"3","walkable":"false","effect":"value"},{"x":270,"y":-240,"type":"3","walkable":"false","effect":"value"},{"x":330,"y":-300,"type":"3","walkable":"false","effect":"value"},{"x":360,"y":-360,"type":"3","walkable":"false","effect":"value"},{"x":330,"y":-420,"type":"3","walkable":"false","effect":"value"},{"x":360,"y":-450,"type":"3","walkable":"false","effect":"value"},{"x":390,"y":-480,"type":"3","walkable":"false","effect":"value"},{"x":390,"y":-510,"type":"3","walkable":"false","effect":"value"},{"x":270,"y":-510,"type":"3","walkable":"false","effect":"value"},{"x":240,"y":-480,"type":"3","walkable":"false","effect":"value"},{"x":270,"y":-450,"type":"3","walkable":"false","effect":"value"},{"x":90,"y":-420,"type":"3","walkable":"false","effect":"value"},{"x":60,"y":-480,"type":"3","walkable":"false","effect":"value"},{"x":30,"y":-480,"type":"3","walkable":"false","effect":"value"},{"x":120,"y":-390,"type":"3","walkable":"false","effect":"value"},{"x":210,"y":-300,"type":"3","walkable":"false","effect":"value"},{"x":240,"y":-270,"type":"3","walkable":"false","effect":"value"},{"x":270,"y":-210,"type":"3","walkable":"false","effect":"value"},{"x":330,"y":-210,"type":"3","walkable":"false","effect":"value"},{"x":390,"y":-210,"type":"3","walkable":"false","effect":"value"},{"x":270,"y":-150,"type":"3","walkable":"false","effect":"value"},{"x":240,"y":-150,"type":"3","walkable":"false","effect":"value"},{"x":300,"y":-150,"type":"3","walkable":"false","effect":"value"},{"x":330,"y":-150,"type":"3","walkable":"false","effect":"value"},{"x":390,"y":-120,"type":"3","walkable":"false","effect":"value"},{"x":360,"y":-90,"type":"3","walkable":"false","effect":"value"},{"x":330,"y":-90,"type":"3","walkable":"false","effect":"value"},{"x":360,"y":-60,"type":"3","walkable":"false","effect":"value"},{"x":330,"y":-30,"type":"3","walkable":"false","effect":"value"},{"x":390,"y":-30,"type":"3","walkable":"false","effect":"value"},{"x":360,"y":0,"type":"3","walkable":"false","effect":"value"},{"x":360,"y":30,"type":"3","walkable":"false","effect":"value"},{"x":360,"y":60,"type":"3","walkable":"false","effect":"value"},{"x":360,"y":90,"type":"3","walkable":"false","effect":"value"},{"x":330,"y":120,"type":"3","walkable":"false","effect":"value"},{"x":360,"y":120,"type":"3","walkable":"false","effect":"value"},{"x":330,"y":150,"type":"3","walkable":"false","effect":"value"},{"x":420,"y":180,"type":"3","walkable":"false","effect":"value"},{"x":360,"y":210,"type":"3","walkable":"false","effect":"value"},{"x":330,"y":210,"type":"3","walkable":"false","effect":"value"}]
   ,   width: 400,
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
