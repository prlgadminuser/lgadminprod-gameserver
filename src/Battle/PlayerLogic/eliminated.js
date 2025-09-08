"use strict";

const { UpdatePlayerWins, UpdatePlayerPlace } = require("@main/src/Database/ChangePlayerStats");
const { spawnAnimation } = require("@main/src/gameObjectEvents/animations");
const { startSpectatingLogic } = require("./spectating");
const { game_win_rest_time } = require("@main/modules");


// playerstates: 1:alive 2:respawning 3:eliminated
function handleElimination(room, target) {
  if (room.state !== "playing" || room.winner !== -1) return;

  const eliminatedPlayer = room.players.get(target.playerId);
  if (!eliminatedPlayer || eliminatedPlayer.eliminated) return;

  // Execute the core elimination actions for the player.
  eliminatePlayer(room, eliminatedPlayer);

  if (room.IsTeamMode) {
    // Check if the entire team is now eliminated.
    const team = room.teams.get(eliminatedPlayer.teamId);
    const isTeamEliminated = team.players.every((player) => {
      const p = room.players.get(player.id);
      return !p || p.eliminated;
    });

    if (isTeamEliminated) {
      // Find the place for the eliminated team.
      const teamPlace = room.teams.size - room.eliminatedTeams.length;
      team.players.forEach((player) => {
        const p = room.players.get(player.id);
        if (p) {
          p.place = teamPlace;
         UpdatePlayerPlace(p, teamPlace, room);
        }
      });
      room.eliminatedTeams.push({ id: team.id, place: teamPlace });
    }
  } else {
    // SOLO MODE ELIMINATION
    const eliminatedCount = [...room.players.values()].filter(
      (p) => p.eliminated
    ).length;
    const playerPlace = room.players.size - eliminatedCount + 1;
    eliminatedPlayer.place = playerPlace;
    UpdatePlayerPlace(eliminatedPlayer, playerPlace, room);
  }

  // Final check for a winner or end-of-game condition.
  checkGameEndCondition(room);
}

// Helper function to handle the core elimination actions for a single player.
function eliminatePlayer(room, player) {
  spawnAnimation(room, player, "eliminated");
  player.eliminated = true;
  player.alive = false;
  player.state = 3;
  player.moving = false;
  room.realtimegrid.removeObject(player);

  // Clear any active intervals/timeouts for the player.
  if (player.moveInterval) {
    clearInterval(player.moveInterval);
  }
  if (player.timeout) {
    clearTimeout(player.timeout);
  }

  room.setRoomTimeout(() => {
      startSpectatingLogic(player, room);
    }, 3000)
}

// Helper function to check for the final win/end condition.
function checkGameEndCondition(room) {
  let remainingTeamsOrPlayers;
  if (room.IsTeamMode) {
    remainingTeamsOrPlayers = [...room.teams.values()].filter((team) =>
      team.players.some((player) => !player.eliminated)
    );
  } else {
    remainingTeamsOrPlayers = [...room.players.values()].filter(
      (p) => !p.eliminated
    );
  }

  // Check if a single winner remains.
  if (remainingTeamsOrPlayers.length === 1) {
    const winner = remainingTeamsOrPlayers[0];
    if (room.IsTeamMode && room.winner === -1) {
      room.winner = winner.id;
      winner.players.forEach((player) => {
        const p = player;
        p.place = 1;
         UpdatePlayerWins(p, 1);
        UpdatePlayerPlace(p, 1, room);
      });
    } else if (room.winner === -1) {
      room.winner = winner.id;
      winner.place = 1;
       UpdatePlayerWins(winner, 1);
      UpdatePlayerPlace(winner, 1, room);
    }
    // Set a timeout to close the room after a win.
     room.setRoomTimeout(() => {
        room.close(); 
    }, game_win_rest_time)
  }
  // If no one is left, also close the room.
  else if (remainingTeamsOrPlayers.length === 0) {
       room.setRoomTimeout(() => {
    room.close();
  }, game_win_rest_time);
}
}

module.exports = { handleElimination, checkGameEndCondition, eliminatePlayer };
