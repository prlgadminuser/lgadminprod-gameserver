

function handleDummyCollision(room, shootingPlayer, dummyKey, damage) {

  const dummy = room.dummies[dummyKey];

  if (!dummy) {
    console.error(`Dummy with key ${dummyKey} not found.`);
    return;
  }


  const GUN_BULLET_DAMAGE = Math.min(damage, dummy.health);

  dummy.health -= GUN_BULLET_DAMAGE;

  const hit = [Math.round(dummy.x), Math.round(dummy.y), GUN_BULLET_DAMAGE]

  shootingPlayer.hitmarkers.push(hit);

  if (dummy.health < 1) {
    spawnAnimation(room, dummy, "eliminated")

    delete room.dummies[dummyKey];


     room.setRoomTimeout(() => {
      if (room) {
        respawnDummy(room, dummyKey, dummy, shootingPlayer);

      }
    }, 4000);
  }
 
}


function respawnDummy(room, dummyKey, dummy) {

  if (room) {

    const originalDummy = {
      ...dummy
    };

    originalDummy.health = dummy.starthealth

    if (room) {
      room.dummies[dummyKey] = originalDummy;
    }
  }
}



