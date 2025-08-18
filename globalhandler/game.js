"use strict";

function hidePlayer(player) {

  player.health = 0; 
  player.alive = false;
}




module.exports = {
  hidePlayer,
};