
function addKillToKillfeed(room, type, killer, target, gunid) {
  const timestamp = Date.now(); // Get current timestamp (in milliseconds)

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

  const killEntry = {
    entry: entryMessage,
    timestamp: timestamp,
  };

  room.killfeed.push(killEntry);
}

module.exports = {
  addKillToKillfeed,
};
