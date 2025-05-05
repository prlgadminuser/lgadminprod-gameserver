"use strict";

function hidePlayer(player) {

  player.health = 0; 
  player.visible = false;
}




module.exports = {
  hidePlayer,
};