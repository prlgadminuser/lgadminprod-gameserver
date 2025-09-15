

function AddNewUnseenObject(room, obj) {
  room.notSeenStaticObjectgrid.addObject(obj);
}

//   const obj = { type: "spray", x: player.x, y: player.y }
//    PlaceNewObject(this.room, obj)

module.exports = {AddNewUnseenObject}