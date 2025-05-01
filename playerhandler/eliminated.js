"use strict";

const { increasePlayerPlace, increasePlayerWins } = require('./../globalhandler/dbrequests')
const { endGame } = require('./../globalhandler/game')
const { game_win_rest_time } = require('./../globalhandler/config')
const { startSpectatingLogic } = require('./spectating')


// playerstates: 1:alive 2:respawning 3:eliminated

function handleElimination(room, team) {
    if (room.state !== "playing" || room.winner !== -1) {
        return; // Exit if the game is not in playing state or a winner is already declared
    }

    // Calculate the team's place based on the remaining teams at the time of elimination
    const remainingActiveTeams = room.teams.filter(t => t.players.some(player => !player.eliminated)).length;
    const teamPlace = room.teams.length - room.eliminatedTeams.length;

    // Ensure no duplicate places
    let adjustedPlace = teamPlace;
    while (room.eliminatedTeams.some(t => t.place === adjustedPlace)) {
        adjustedPlace++;
    }

    // Set the place for all players in the team before changing their state
    team.forEach(player => {
        const playerObj = room.players.get(player.playerId);
        if (playerObj && !playerObj.eliminated) {
            playerObj.place = adjustedPlace;
            increasePlayerPlace(playerObj.playerId, adjustedPlace, room);
        }
    });

    // Now mark all players in the team as eliminated and change their state
    team.forEach(player => {
        const playerObj = room.players.get(player.playerId);
        if (playerObj && !playerObj.eliminated) {
            playerObj.eliminated = true;
            playerObj.visible = false;
            playerObj.state = 3;
            playerObj.moving = false; // Mark as eliminated (spectator state)

            clearInterval(playerObj.moveInterval);
            clearTimeout(playerObj.timeout);

            room.timeoutIds.push(setTimeout(() => {
                startSpectatingLogic(playerObj, room); // Start spectating after a short delay
            }, 3000));
        }
    });

    // Add the eliminated team to the list with its place
    room.eliminatedTeams.push({
        teamId: team.id, // Using the team ID instead of player IDs for the team identifier
        place: adjustedPlace,
    });

    // Check if the game should end (all players from all teams are either eliminated or invisible)
    if (room.teams.every(t => t.players.every(player => player.eliminated || !player.visible))) {
        room.timeoutIds.push(setTimeout(() => {
            endGame(room); // End the game after a short delay
        }, game_win_rest_time));
    }

    // Check if only one team remains with active players
    const remainingTeams = room.teams.filter(t => t.players.some(player => !room.players.get(player.playerId).eliminated));
    if (remainingTeams.length === 1) {
        const winningTeam = remainingTeams[0];

        // Check if the winning team has only one active player
        const activePlayers = winningTeam.players.filter(player => !room.players.get(player.playerId).eliminated);
        if (activePlayers.length === 1) {
            const remainingPlayer = activePlayers[0];
            room.winner = remainingPlayer.nmb; // Winner is the player with no eliminations
        } else {
            room.winner = winningTeam.id; // Multiple players in the team
        }

        // Mark the winning players with place 1
        winningTeam.players.forEach(player => {
            const playerObj = room.players.get(player.playerId);
            playerObj.place = 1; // Set place to 1 for winning team players
            increasePlayerWins(playerObj.playerId, 1);
            increasePlayerPlace(playerObj.playerId, 1, room);
        });

        // Add the winning team to the eliminatedTeams array with place 1
        room.eliminatedTeams.push({
            teamId: winningTeam.id, // Use the team ID for the winner
            place: 1,
        });

        room.timeoutIds.push(setTimeout(() => {
            endGame(room); // End the game after a short delay
        }, game_win_rest_time));
    }
}


module.exports = {
    handleElimination,
  };
  