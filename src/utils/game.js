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
      Math.round(target.position.x),
      Math.round(target.position.y),
      damage,
    ]);
  },

  AddNewUnseenObject(room, obj) {
    room.grid.addObject(obj);
  },

  isPositionOutsideMapBounds(room, position) {
    const { x, y } = position
    const mapWidth = room.mapWidth;
    const mapHeight = room.mapHeight;
    return x < -mapWidth || x > mapWidth || y < -mapHeight || y > mapHeight;

  },

  getPlayersInRange(room, centerX, centerY) {
    const viewmultiplier = 1;
    const xThreshold = 420 * viewmultiplier;
    const yThreshold = 240 * viewmultiplier;

    const xMin = centerX - xThreshold;
    const xMax = centerX + xThreshold;
    const yMin = centerY - yThreshold;
    const yMax = centerY + yThreshold;

    const nearbyPlayers = room.grid.getObjectsInArea(
      xMin,
      xMax,
      yMin,
      yMax,
      "player",
    );

    return nearbyPlayers;
  },

 findNearestPlayer(eliminatedPlayer, players) {
  if (!players || !players.size) return null;

  const ex = eliminatedPlayer.position.x;
  const ey = eliminatedPlayer.position.y;

  let nearest = null;
  let minDistSq = Infinity;

  for (const p of players) {
    const dx = p.position.x - ex;
    const dy = p.position.y - ey;
    const d2 = dx * dx + dy * dy;

    if (d2 < minDistSq) {
      minDistSq = d2;
      nearest = p;
    }
  }

  return nearest;
}


  //   const obj = { type: "spray", x: player.x, y: player.y }
  //    PlaceNewObject(this.room, obj)
};
