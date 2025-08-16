
const { handlePlayerCollision, handleDummyCollision } = require("./player")

function HandleAfflictions(room) {
  const now = Date.now();

  // Iterate backward to allow removal
  for (let i = room.activeAfflictions.length - 1; i >= 0; i--) {
    const aff = room.activeAfflictions[i];

    // Remove if expired
    if (now >= aff.expires) {
      room.activeAfflictions.splice(i, 1);
      continue;
    }

    // Skip until next tick
    if (now < aff.nextTick) continue;

    // Apply effect
    if (aff.target_type === "dummy") {
      if (!room.dummies[aff.dummykey]) {
        room.activeAfflictions.splice(i, 1);
        continue;
      }
      handleDummyCollision(room, aff.shootingPlayer, aff.dummykey, aff.damage);
    } else if (aff.target_type === "player") {
      if (!aff.target.visible) {
        room.activeAfflictions.splice(i, 1);
        continue;
      }
      handlePlayerCollision(room, aff.shootingPlayer, aff.target, aff.damage, aff.gunid);
    }

    // Schedule next tick
    aff.nextTick += aff.speed;
  }
}


module.exports = { HandleAfflictions }