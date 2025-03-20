
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
  
  // Create the killfeed entry with a timestamp
  const killEntry = {
    entry: entryMessage,
    timestamp: timestamp
  };

  // Add the entry to the beginning of the killfeed (latest at the front)
  room.killfeed = [killEntry, ...room.killfeed];  // Replaces unshift using map

  

  // Ensure that the killfeed only holds the last 5 entries
  if (room.killfeed.length > 5) {
    room.killfeed = room.killfeed.slice(0, 5);  // Replaces pop using map/slice
  }
  room.newkillfeed = getKillfeed(room)
}

// Function to get the current killfeed from the room
function getKillfeed(room) {
  return room.killfeed.map(entry => entry.entry); // Only return the kill entry text
}

// Function to remove entries older than 5 seconds
function removeOldKillfeedEntries(room) {
  const currentTime = Date.now();
  
  // Use map to iterate and filter out entries that are older than 5 seconds
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
