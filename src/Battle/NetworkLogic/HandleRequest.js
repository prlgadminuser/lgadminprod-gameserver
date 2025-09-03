const { handleBulletFired } = require("../WeaponLogic/bullets");
const { handleMovement } = require("../PlayerLogic/movement");
const { validDirections } = require("../utils/game");



function handleRequest(result, message) {
  const player = result.room.players.get(result.playerId);

  if (message.length > 10) {
    player.wsClose(4000, "ahhh whyyyyy");
    return;
  }

  if (!player) return;

  switch (message) {

    case "0":
      handleGlobalMSMeasurePong(player, result.room);
      break;

    case "1":
      handlePong(player);
      break;
  }


  if (
    result.room.state !== "playing" ||
    player.alive === false ||
    player.eliminated ||
    !result.room.winner === -1
  )
    return;

  const data = message.split(":");

  const type = data[0];

  switch (type) {
    case "3":
      handleMovementData(data, player);
      break;
    case "4":
      handleShoot(data, player, result.room);
      break;
    case "5":
      handleSwitchGun(data, player);
      break;
    case "6":
      handleEmote(data, player);
      break;
    case "7":
      handleGadget(player);
      break;
  }

  if (type === "2") {
    player.moving = false;
  }
}

function handleGlobalMSMeasurePong (player, room) {
  const now = Date.now();

  if (!room.lastglobalping) {
    return;
  }

  player.ping_ms = now - room.lastglobalping;
}


function handlePong(player) {
  const now = Date.now();

  if (player.lastPing && now - player.lastPing < 1000) {
    return;
  }
  player.lastPing = now;
}

function handleShoot(data, player, room) {
  const shoot_direction = data[1];
  if (shoot_direction > -181 && shoot_direction < 181) {
    player.shoot_direction = parseFloat(shoot_direction);
    handleBulletFired(room, player, player.gun);
  }
}

function handleSwitchGun(data, player) {
  const GunSlot = data[1];
  if (
    !player.shooting &&
    GunSlot >= 1 &&
    GunSlot <= 3 &&
     player.loadout[`slot${GunSlot}`] !== player.gun
  ) {
    player.gun = player.loadout[`slot${GunSlot}`];
  }
}

function handleEmote(data, player) {
  const emoteid = data[1];
  if (emoteid >= 1 && emoteid <= 4 && player.emote === 0) {
    player.emote = emoteid;
    player.timeoutIds.push(
      setTimeout(() => {
        player.emote = 0;
      }, 3000)
    );
  }
}

function handleGadget(player) {
  if (player.canusegadget && player.gadgetuselimit > 0) {
    player.canusegadget = false;
    player.gadgetuselimit--;
    player.usegadget(player);
    player.timeoutIds.push(
      setTimeout(() => {
        player.canusegadget = true;
      }, player.gadgetcooldown)
    );
  }
}
const isValidDirection = (direction) => {
  const numericDirection = parseFloat(direction);
  return !isNaN(numericDirection) && validDirections.includes(numericDirection);
};


function handleMovementData(data, player) {
  const direction = data[1];

  if (isValidDirection(direction)) {
    const validDirection = direction;
    if (validDirection) {
      updatePlayerDirection(player, direction);
      player.moving = true;
      //handlePlayerMoveInterval(player, room);
    } else {
      console.warn("Invalid direction value:", direction);
    }
  }
}

function updatePlayerDirection(player, direction) {
  player.direction = direction;

  if (player.direction == -180 || player.direction == 0) {
  } else
    player.direction2 = direction > 0 ? -90 : 90 // Adjust otherwise
}


async function handlePlayerMoveIntervalAll(room) {
  room.players.forEach((player) => {
    if (player.moving && player.state === 1) {
      handleMovement(player, room);
  
    }
  });
}


module.exports = { handleRequest, handlePlayerMoveIntervalAll }