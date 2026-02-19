
function addEntryToKillfeed(room, type, killer, target, gunid) {

  let entryMessage;

  switch (type) {
    case 1: // eliminated
      entryMessage = [type, killer, target, gunid];
      break;

    case 2: // knocked
      entryMessage = [type, killer, target, gunid];
      break;

    case 3: // eliminated by storm
      entryMessage = [type, target];
      break;

    case 4: // knocked by storm
      entryMessage = [type, target];
      break;

    case 5: // left the game
      entryMessage = [type, target];
      break;
  }

  room.killfeed.push(entryMessage);
}

module.exports = {
  addEntryToKillfeed,
};
