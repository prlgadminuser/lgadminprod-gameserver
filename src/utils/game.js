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

  getTeamPlayersIds(room, player) {
    if (!room.teams || !player.teamId) return [];

    const team = room.teams.get(player.teamId);
    if (!team) return [];

    return team.players.map((p) => p.id);
  },

  isPositionOutsideMapBounds(room, x, y) {
    const mapWidth = room.mapWidth;
    const mapHeight = room.mapHeight;
    return x < -mapWidth || x > mapWidth || y < -mapHeight || y > mapHeight;
  },

  getRandomPositionInMap(room) {
  const x = Math.round((Math.random() * 2 - 1) * room.mapWidth);
  const y = Math.round((Math.random() * 2 - 1) * room.mapHeight);

  return { x, y };
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
  if (!players.size) return
  let nearestPlayer = null;
  let shortestDistanceSq = Infinity;

  for (const player of players) {
    const dx = player.x - eliminatedPlayer.x;
    const dy = player.y - eliminatedPlayer.y;
    const distanceSq = dx * dx + dy * dy; // squared distance

    if (distanceSq < shortestDistanceSq) {
      shortestDistanceSq = distanceSq;
      nearestPlayer = player;
    }
  }

  return nearestPlayer;
}


  //   const obj = { type: "spray", x: player.x, y: player.y }
  //    PlaceNewObject(this.room, obj)
};
