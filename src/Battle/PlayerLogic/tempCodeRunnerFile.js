
          dirtyObjects.push([obj.id, obj.type, obj.x, obj.y, obj.hp, obj.rotation]);
        }
        break;
    }
  }

  // Update memory for next tick
  player.lastNearbyObjects = newNearbySet;

  // --- 2. Assign results back to player ---
  player.nearbyplayersids = otherPlayers;
  player.nearbybullets = nearbyBullets;
  player.newSeenObjectsStatic = staticObjects.length ? staticObjects : undefined;
  player.newSpawns = dirtyObjects.length ? newSpawns : undefined;

  // Optionally return bundled data
  return {
    players: player.nearbyplayersids,
    bullets: player.nearbybullets,
    newStatic: player.newSeenObjectsStatic,
    newSpawns: player.newSpawns,
  };
}

function playerchunkrenderer(room) {
  const roomplayers = Array.from(room.players.values());
  roomplayers.forEach(player => getPlayerViewObjects(room, player));
}


function getPlayersInRange(room, centerX, centerY) {

  const xMin = centerX - xThreshold;
  const xMax = centerX + xThreshold;
  const yMin = centerY - yThreshold;
  const yMax = centerY + yThreshold;

 const nearbyPlayers = room.grid.getObjectsInArea(xMin, xMax, yMin, yMax, "player");

  return nearbyPlayers;
}

module.exports = {
  getPlayerViewObjects,
  playerchunkrenderer,
  getPlayersInRange
};
