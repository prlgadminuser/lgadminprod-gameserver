

function PoisonDamageHandler(room) {
  const now = Date.now();

  // Iterate backward to allow safe removal
  for (let i = room.activeAfflictions.length - 1; i >= 0; i--) {
    const aff = room.activeAfflictions[i];

    // Remove if expired
    if (now >= aff.expires) {
      room.activeAfflictions.splice(i, 1);
      continue;
    }

    // Skip until next tick
    if (now < aff.nextTick) continue;

    // Check target existence
    let targetAlive = aff.target.alive
    const targetType = aff.target.objectType

    if (!targetAlive) {
      room.activeAfflictions.splice(i, 1);
      continue;
    }

    if (targetType === "player") {
    // Apply effect
    aff.shootingPlayer.HandleSelfBulletsOtherPlayerCollision(
      aff.target,
      aff.damage,
      aff.gunid,
      room
    );

  } else if (targetType === "bot") {

     
    aff.target.damage(aff.damage, aff.shootingPlayer)
    



    }


    // Schedule next tick
    aff.nextTick += aff.speed;
  }
}

module.exports = { PoisonDamageHandler };