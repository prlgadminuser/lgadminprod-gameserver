"use strict";

const { increasePlayerPlace, increasePlayerWins } = require('./../globalhandler/dbrequests')
const { game_win_rest_time } = require('./../globalhandler/config')
const { closeRoom } = require("./../roomhandler/manager")

function updateTeamScore(room, player, points) {

    const targetpoints = 20

    // Find the player by playerId

    // Find the team that matches the player's team ID
    const team = room.teams.find(t => t.id === player.team.id);
    if (!team) {
        return;
    }

    // Update the team's total score
    team.score += points;


    const t1 = room.teams[0];
    const t2 = room.teams[1];

    

    room.scoreboard = [
       t1.id,
       t1.score,
       t2.id,
       t2.score,
    ].join('$')


    // Check if any team has reached 50 points
    if (room.winner !== -1) {
        return;
    }

    const team1Score = t1.score
    const team2Score = t2.score

    if (team1Score >= targetpoints) {
        declareWinner(room, room.teams[0]); // Declare team 1 as the winner
    } else if (team2Score >= targetpoints) {
        declareWinner(room, room.teams[1]); // Declare team 2 as the winner
    }

   
    
}

function declareWinner(room, winningTeam) {
    // Declare the team as the winner and update all players' states
    room.winner = winningTeam.id; // Set the winning team

    // Loop through all players in the winning team and mark them as winners
    winningTeam.players.forEach(player => {
        const playerObj = room.players.get(player.playerId);
        if (playerObj) {
            playerObj.place = 1; // Mark them in first place
            increasePlayerWins(playerObj, 1); // Increase player wins
            increasePlayerPlace(playerObj, 1, room); // Increase player place
        }
    });

    // Add the winning team to eliminated teams (with place 1)
    room.eliminatedTeams.push({
        teamId: winningTeam.id,
        place: 1,
    });

    const secondPlaceTeam = room.teams.find(t => t.id !== winningTeam.id);
    if (secondPlaceTeam) {
        // Mark all players in the second-place team
        secondPlaceTeam.players.forEach(player => {
            const playerObj = room.players.get(player.playerId);
            if (playerObj) {
                playerObj.place = 2; // Second place
                increasePlayerPlace(playerObj, 2, room); // Increase player place
            }
        });

        // Add the second-place team to eliminated teams
        room.eliminatedTeams.push({
            teamId: secondPlaceTeam.id,
            place: 2,
        });
    }

    // End the game after declaring the winner
    room.timeoutIds.push(setTimeout(() => {
       closeRoom(room.roomId); 
    }, game_win_rest_time)); 
}

module.exports = {
    updateTeamScore
}