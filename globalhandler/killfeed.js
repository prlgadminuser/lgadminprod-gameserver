
const { compressMessage } = require('./..//index.js');

function addKillToKillfeed(room, type, killer, target, gunid) {
  const timestamp = Date.now(); // Get current timestamp (in milliseconds)

  let entryMessage;

switch (type) {
  case 1: // eliminated
    entryMessage = `${type}$${killer}$${target}$${gunid}`;
    break;
  case 2: // knocked
    entryMessage = `${type}$${killer}$${target}$${gunid}`;
    break;

  case 3: // eliminated by storm
    entryMessage = `${type}$${target}$`;
    break;

  case 4: // knocked by storm
    entryMessage = `${type}$${target}$`;
    break;

  case 5: // left the game
    entryMessage = `${type}$${target}$`;
    break;

}
  
  const killEntry = {
    entry: entryMessage,
    timestamp: timestamp
  };

  room.killfeed = [killEntry, ...room.killfeed]; 

  if (room.killfeed.length > 5) {
    room.killfeed = room.killfeed.slice(0, 5); 
  }
  room.newkillfeed = getKillfeed(room)

 // sendNewFeedPacketToAll(room, entryMessage)

}

function sendNewFeedPacketToAll(room, entry) {
  room.players.forEach(player => {

    const MessageToSend = {
      kP: entry,
    };

    const FinalPreMessage = JSON.stringify(MessageToSend)
    const compressedPlayerMessage = compressMessage(FinalPreMessage)
    player.send(compressedPlayerMessage, { binary: true })

  })
}



function getKillfeed(room) {
  return room.killfeed.map(entry => entry.entry);
}


function removeOldKillfeedEntries(room) {
  const currentTime = Date.now();
  
  room.killfeed = room.killfeed.filter(entry => currentTime - entry.timestamp <= 5000);
  room.newkillfeed = getKillfeed(room) // You can't directly replace filter with map, as filter is for removal, but map could be used to modify elements if needed
}

// Example usage
function StartremoveOldKillfeedEntries(room) {
  room.intervalIds.push(setInterval(() => {
      removeOldKillfeedEntries(room)
    }, 1000));
}

module.exports = {
  addKillToKillfeed,
  getKillfeed,
  StartremoveOldKillfeedEntries,
}
