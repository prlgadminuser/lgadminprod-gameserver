const { handleBulletFired } = require("../objects/bullets");
const { validDirections } = require("../utils/game");

function handleRoomMessage(room, player, message) {
  if (!player) player.wsClose(4000, "message_cant_access_user");

  if (room.state !== "playing" || player.alive === false || player.eliminated)
    return;

  const data = message.split(":");

  const type = data[0];

  if (room.gameEnded) {
    if (type === "6") {
      // emote only
      handleEmote(data, player, room);
    }
    return;
  }

  switch (type) {
    case "3":
      handleMovementData(data, player);
      break;
    case "4":
      handleShoot(data, player, room);
      break;
    case "5":
      handleSwitchGun(data, player);
      break;
    case "6":
      handleEmote(data, player, room);
      break;
    case "7":
      handleGadget(room, player);
      break;
  }

  if (type === "2") {
    player.moving = false;
  }
}

function handleGlobalMSMeasurePong(player, room) {
  const now = Date.now();

  if (!room.lastglobalping) {
    return;
  }

  player.ping_ms = now - room.lastglobalping;
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

function handleEmote(data, player, room) {
  const emoteid = data[1];
  if (emoteid >= 1 && emoteid <= 4 && player.emote === 0) {
    player.emote = emoteid;
    room.setRoomTimeout(() => {
      player.emote = 0;
    }, 3000);
  }
}

function handleGadget(room, player) {
  if (player.canusegadget && player.gadgetuselimit > 0) {
    player.canusegadget = false;
    player.gadgetuselimit--;
    player.useGadget(player);
    room.setRoomTimeout(() => {
      player.canusegadget = true;
    }, player.gadgetcooldown);
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

  if (player.direction != -180 && player.direction != 0) {
    player.direction2 = direction > 0 ? -90 : 90; // Adjust otherwisew
  }
}

module.exports = { handleRoomMessage };
