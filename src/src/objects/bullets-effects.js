


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
       aff.shootingPlayer.HandleSelfBulletsOtherPlayerCollision(aff.target, aff.damage, aff.gunid, room)
    } else if (aff.target_type === "player") {
      if (!aff.target.alive) {
        room.activeAfflictions.splice(i, 1);
        continue;
      }
      aff.shootingPlayer.HandleSelfBulletsOtherPlayerCollision(aff.target, aff.damage, aff.gunid, room)
    }

    // Schedule next tick
    aff.nextTick += aff.speed;
  }
}


module.exports = { HandleAfflictions }