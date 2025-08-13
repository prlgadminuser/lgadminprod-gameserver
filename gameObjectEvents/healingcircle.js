
const { playerHitboxHeight, playerHitboxWidth } = require('./../globalhandler/config');

function spawnHealingCircle(room) {
  // Filter active players (not eliminated)
  const activePlayers = Array.from(room.players.values()).filter((player) => player.state === 1 && player.health > 0);
  if (activePlayers.length === 0) return; // No players to spawn circles for

  // Choose a random active player as the center of the circle
  const randomPlayer = activePlayers[Math.floor(Math.random() * activePlayers.length)];

  // Generate random coordinates around the player within a certain range
const offsetX = Math.floor(Math.random() * 101) - 50; // Random offset between -50 and 50
 const offsetY = Math.floor(Math.random() * 101) - 50; // Random offset between -50 and 50
 // const randomX = randomPlayer.x + offsetX;
 //const randomY = randomPlayer.y + offsetY;

  const randomX = Math.floor(Math.random() * (room.mapWidth * 2 + 1)) - room.mapWidth // Random X between -mapWidth/2 and mapWidth/2
  const randomY = Math.floor(Math.random() * (room.mapHeight * 2 + 1)) - room.mapHeight// Random Y between -mapHeight/2 and mapHeight/2




  // Define a new healing circle object

  const gridkey = Math.random().toString(36).substring(2, 7)

  const newCircle = {
    obj_id: gridkey,
    id: "circle",
    type: `1`,
    x: randomX,      // Center x-coordinate
    y: randomY,          // Center y-coordinate
    radius: 0,                  // Initial radius
    expansionRate: 0.25,           // Radius growth rate per second
    healAmount: 1,             // Healing amount per tick
    duration: 30000,            // Duration in milliseconds (20 seconds)
    elapsedTime: 0,
    maxradius: 70,              // Max radius the circle will reach
    shrinkRate: 0.1,            // Shrink rate after maxradius is reached          // Flag to track if shrinking is active
  };



 

  room.itemgrid.addObject(newCircle)

  // Add the new circle to the room's healing circles
  room.objects.push(newCircle);

 // console.log(`Healing circle spawned at (${newCircle.x}, ${newCircle.y})`);
}




function updateHealingCircles(deltaTime, room) {
  for (let i = room.objects.length - 1; i >= 0; i--) {
    const circle = room.objects[i];

    // Update elapsed time and radius
    circle.elapsedTime += deltaTime;

    if (circle.maxradius > circle.radius && !(circle.elapsedTime >= circle.duration)) { // only shrink circle if maxradius is not reached
    circle.radius = Math.round(circle.radius + circle.expansionRate * 2);  

}


    // Heal players within the circle
    room.players.forEach((player) => {
      if (player.state === 1 && isPlayerInsideCircle(player, circle) && circle.radius > circle.maxradius * 0.3 ) {
        //player.health = Math.min(player.health + circle.healAmount, player.starthealth);
        player.health = Math.round(Math.min(player.health + circle.healAmount, player.starthealth));
      }
    });

    // Remove circle if it has expired
  if (circle.elapsedTime >= circle.duration) {
    if (1 > circle.radius) {
      room.itemgrid.removeObject(circle)
      room.objects.splice(i, 1);
   //  room.grid.removeObject(circle)
   //  console.log(circle)
     // console.log(circle.id, "deleted")
    } else {

      circle.radius = Math.round(circle.radius - circle.expansionRate * 1.2);
    }

  
 
}
  }
}

function isPlayerInsideCircle(player, circle) {
  const PLAYER_WIDTH = playerHitboxWidth / 2;  // Example player width
  const PLAYER_HEIGHT =  playerHitboxHeight / 2; // Example player height

  // Calculate the distance from the circle center to the closest point on the player's hitbox
  const closestX = Math.max(player.x - PLAYER_WIDTH, Math.min(circle.x, player.x + PLAYER_WIDTH));
  const closestY = Math.max(player.y - PLAYER_HEIGHT, Math.min(circle.y, player.y + PLAYER_HEIGHT));

  // Calculate the distance from the circle center to the closest point
  const distance = Math.sqrt((circle.x - closestX) ** 2 + (circle.y - closestY) ** 2);

  // Check if the distance is within the circle's radius
  return distance <= circle.radius;
}

// Integrate into the game loop
function initializeHealingCircles(room) {
  // Initialize the list of healing circles
  room.objects = [];

  spawnHealingCircle(room);

  // Spawn a new healing circle every 30 seconds
  room.intervalIds.push(setInterval(() => {
    spawnHealingCircle(room);
  }, 30000));

  // Update healing circles at a regular interval (e.g., 250ms)
  room.intervalIds.push(setInterval(() => {
    updateHealingCircles(250, room);
  }, 100));
}

module.exports = {
  initializeHealingCircles
};


