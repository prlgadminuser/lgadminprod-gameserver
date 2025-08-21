"use strict";

const {
  increasePlayerPlace,
  increasePlayerWins,
} = require("./../globalhandler/dbrequests");
const { game_win_rest_time } = require("./../globalhandler/config");
const { startSpectatingLogic } = require("./spectating");
const { closeRoom } = require("./../roomhandler/manager");
const { spawnAnimation } = require('./../gameObjectEvents/animations')

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
          increasePlayerPlace(p, teamPlace, room);
        }
      });
      room.eliminatedTeams.push({ id: team.id, place: teamPlace });
    }
  } else {
    // SOLO MODE ELIMINATION
    const eliminatedCount = [...room.players.values()].filter((p) => p.eliminated).length;
    const playerPlace = room.players.size - eliminatedCount + 1;
    eliminatedPlayer.place = playerPlace;
    increasePlayerPlace(eliminatedPlayer, playerPlace, room);
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

  room.timeoutIds.push(
    setTimeout(() => {
      startSpectatingLogic(player, room);
    }, 3000)
  );
}

// Helper function to check for the final win/end condition.
function checkGameEndCondition(room) {
  let remainingTeamsOrPlayers;
  if (room.IsTeamMode) {
    remainingTeamsOrPlayers = [...room.teams.values()].filter(
      (team) => team.players.some(player => !room.players.get(player.id).eliminated)
    );
  } else {
    remainingTeamsOrPlayers = [...room.players.values()].filter((p) => !p.eliminated);
  }

  // Check if a single winner remains.
  if (remainingTeamsOrPlayers.length === 1) {
    const winner = remainingTeamsOrPlayers[0];
    if (room.IsTeamMode) {
      room.winner = winner.id;
      winner.players.forEach((player) => {
        const p = room.players.get(player.id);
        p.place = 1;
        increasePlayerWins(p, 1);
        increasePlayerPlace(p, 1, room);
      });
    } else {
      room.winner = winner.id;
      winner.place = 1;
      increasePlayerWins(winner, 1);
      increasePlayerPlace(winner, 1, room);
    }
    // Set a timeout to close the room after a win.
    room.timeoutIds.push(setTimeout(() => closeRoom(room.roomId), game_win_rest_time));
  } 
  // If no one is left, also close the room.
  else if (remainingTeamsOrPlayers.length === 0) {
    room.timeoutIds.push(setTimeout(() => closeRoom(room.roomId), game_win_rest_time));
  }
}

module.exports = { handleElimination, checkGameEndCondition };

