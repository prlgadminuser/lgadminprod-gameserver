const { playerHitboxHeight, playerHitboxWidth } = require('./../globalhandler/config');

function spawnHealingCircle(room) {
  // Filter active players (not eliminated)
  const activePlayers = Array.from(room.players.values()).filter((player) => player.state === 1 && player.health > 0);
  if (activePlayers.length === 0) return;

  const randomPlayer = activePlayers[Math.floor(Math.random() * activePlayers.length)];

  // Random coordinates anywhere in the map
  const randomX = Math.floor(Math.random() * (room.mapWidth * 2 + 1)) - room.mapWidth;
  const randomY = Math.floor(Math.random() * (room.mapHeight * 2 + 1)) - room.mapHeight;

  const gridkey = Math.random().toString(36).substring(2, 7);

  const newCircle = {
    obj_id: gridkey,
    id: "circle",
    type: "1",
    x: randomX,
    y: randomY,
    radius: 0,          // Initial radius
    expansionRate: 0.5,   // Integer radius growth per update
    healAmount: -1,      // Integer healing amount
    duration: 30000,    // Duration in milliseconds
    elapsedTime: 0,
    maxradius: 70,      // Max radius
    shrinkRate: 0.5,      // Integer shrink per update
  };

  room.itemgrid.addObject(newCircle);
  room.objects.push(newCircle);
}

function updateHealingCircles(deltaTime, room) {
  for (let i = room.objects.length - 1; i >= 0; i--) {
    const circle = room.objects[i];

    circle.elapsedTime += deltaTime;

    // Expand the circle until max radius or duration reached
    if (circle.radius < circle.maxradius && circle.elapsedTime < circle.duration) {
      circle.radius += circle.expansionRate;
      if (circle.radius > circle.maxradius) circle.radius = circle.maxradius;
    }

    // Heal players inside the circle
    room.players.forEach((player) => {
      if (player.state === 1 && isPlayerInsideCircle(player, circle) && circle.radius > Math.floor(circle.maxradius * 0.3)) {
        player.health = Math.min(player.health + circle.healAmount, player.starthealth);
      }
    });

    // Shrink and remove circle if duration expired
    if (circle.elapsedTime >= circle.duration) {
      if (circle.radius <= 0) {
        room.itemgrid.removeObject(circle);
        room.objects.splice(i, 1);
      } else {
        circle.radius -= circle.shrinkRate;
        if (circle.radius < 0) circle.radius = 0;
      }
    }
  }
}

function isPlayerInsideCircle(player, circle) {
  const PLAYER_WIDTH = playerHitboxWidth / 2;
  const PLAYER_HEIGHT = playerHitboxHeight / 2;

  const closestX = Math.max(player.x - PLAYER_WIDTH, Math.min(circle.x, player.x + PLAYER_WIDTH));
  const closestY = Math.max(player.y - PLAYER_HEIGHT, Math.min(circle.y, player.y + PLAYER_HEIGHT));

  const distance = Math.sqrt((circle.x - closestX) ** 2 + (circle.y - closestY) ** 2);

  return distance <= circle.radius;
}

function initializeHealingCircles(room) {
  room.objects = [];

  // Spawn first healing circle immediately
  spawnHealingCircle(room);

  // Spawn a new healing circle every 30 seconds
  room.intervalIds.push(setInterval(() => {
    spawnHealingCircle(room);
  }, 30000));

  // Update healing circles every 50ms
  room.intervalIds.push(setInterval(() => {
    updateHealingCircles(50, room);
  }, 50));
}

module.exports = {
  initializeHealingCircles
};



