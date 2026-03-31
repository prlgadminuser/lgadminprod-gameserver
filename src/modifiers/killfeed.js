
function addEntryToKillfeed({room, type, target, gunid}) {

  let entryMessage;

  switch (type) {

    // player eliminated/alive again without type

    case 1: // player eliminated
 entryMessage = [type, target];
      break;

   case 2: // alive / alive again
 entryMessage = [type, target];
      break;

    case 3: // eliminated
      entryMessage = [type, killer, target, gunid];
      break;

    case 4: // knocked
      entryMessage = [type, killer, target, gunid];
      break;

    case 5: // eliminated by storm
      entryMessage = [type, target];
      break;

    case 6: // knocked by storm
      entryMessage = [type, target];
      break;

    case 7: // left the game
      entryMessage = [type, target];
      break;
  }

  room.killfeed.push(entryMessage);
}

module.exports = {
  addEntryToKillfeed,
};
