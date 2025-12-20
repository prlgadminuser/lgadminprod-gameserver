

module.exports = {
  
  validDirections: [-90, 0, 180, -180, 90, 45, 135, -135, -45],

  isValidDirection(direction) {
    const numericDirection = parseFloat(direction);
    return (
      !isNaN(numericDirection) &&
      this.validDirections.includes(numericDirection)
    );
  },

  encodePosition(num) {
    return Math.round(num * 100); // keep 2 decimals
  },

   encodePlayerSpeed(num) {
    return Math.round(num * 10); // keep 1 decimals
  },


  createHitmarker(target, shooter, damage) {
    shooter.hitmarkers.push([
      Math.round(target.x),
      Math.round(target.y),
      damage,
    ]);
  },

  AddNewUnseenObject(room, obj) {
  room.grid.addObject(obj);
},

//   const obj = { type: "spray", x: player.x, y: player.y }
//    PlaceNewObject(this.room, obj)

};
