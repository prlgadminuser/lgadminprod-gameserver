

function TeamPlayersActive(room, player) {
  // Ensure the player's team is valid
  if (!player.team || player.team.players.length === 0) {
    return 0; // Return 0 if the player's team is not valid or empty
  }

  let count = 0;

  // Loop through the teams and find the team to which the player belongs
  const team = room.teams.find(t => t.id === player.team.id); // Access the team using teamId
  if (!team) {
    return 0; // Return 0 if the team is not found
  }

  // Count the number of active players in the team (state === 1 means active)
  team.players.forEach(teamPlayer => {
    const roomPlayer = room.players.get(teamPlayer.playerId); // Access the player by their playerId
    if (roomPlayer && roomPlayer.state === 1 && !roomPlayer.eliminated) {
      count++;
    }
  });

  return count;
}

module.exports = {
  TeamPlayersActive
};
