const { SpatialGrid, RealTimeObjectGrid, gridcellsize, room_max_open_time, game_start_time } = require("@main/modules");
const { closeRoom } = require("./closeRoom");
const { playerchunkrenderer } = require("../Battle/PlayerLogic/playerchunks");
const { SendPreStartMessage } = require("../Battle/NetworkLogic/Packets");
const { UseZone } = require("../Battle/GameLogic/zone");
const { initializeHealingCircles } = require("../gameObjectEvents/healingcircle");
const { startDecreasingHealth, startRegeneratingHealth } = require("../Battle/GameLogic/modifiers");
const { rooms } = require("./setup");


function cloneSpatialGridNotExpensive(original) {
  let clone = new SpatialGrid(original.cellSize);
  clone.grid = new Map(original.grid);

  return clone;
}

function cloneSpatialGrid(original) {
  const clone = new SpatialGrid(original.cellSize);

  for (const [key, obj] of original.grid.entries()) {
    // Store a shallow copy so modifications don't affect the original
    clone.grid.set(key, { ...obj });
  }

  return clone;
}


async function SetupRoomStartGameData(room) {
  room.itemgrid = new SpatialGrid(gridcellsize); // grid system for items
  room.realtimegrid = new RealTimeObjectGrid(100);
  room.bulletgrid = new RealTimeObjectGrid(60);

  room.grid = cloneSpatialGrid(room.mapdata.grid);
}

async function setupRoomPlayers(room) {
  let playerNumberID = 0; // Start with player number 0

  // Iterate over each player in the room's players collection
  room.players.forEach((player) => {
 
    player.id = playerNumberID;

    const spawnPositions = room.spawns;
    const spawnIndex = playerNumberID % spawnPositions.length; // Distribute players across spawn positions

    (player.x = spawnPositions[spawnIndex].x),
      (player.y = spawnPositions[spawnIndex].y),
      // Assign the spawn position to the player
      (player.startspawn = {
        x: spawnPositions[spawnIndex].x,
        y: spawnPositions[spawnIndex].y,
      });

    // Increment the player number for the next player
    playerNumberID++;

    room.realtimegrid.addObject(player);
  });
}

async function CreateTeams(room) {
    if (!room.players || room.players.size === 0) return;

    const teamIDs = ['Red', 'Blue', 'Green', 'Yellow', 'Cyan', 'Pink', 'Purple', 'Orange'];

    room.teams = new Map();

    let teamIndex = 0;
    room.players.forEach(player => {
        // Find or create the team.
        const teamId = teamIDs[teamIndex] || `Team-${teamIndex + 1}`;
        if (!room.teams.has(teamId)) {
            room.teams.set(teamId, {
                id: teamId,
                players: [],
                score: 0,
            });
        }
        const team = room.teams.get(teamId);

        // Add the player to the team.
        team.players.push({ playerId: player.playerId, id: player.id });
        player.teamId = teamId; // Use a simple reference to the team.

        // Advance to the next team if the current one is full.
        if (team.players.length >= room.teamsize) {
            teamIndex++;
        }
    });

    // Create a single teamdata object and assign it to all players.
    // This is more efficient than creating a separate object for each player.
    const teamDataMap = new Map();
    room.teams.forEach(team => {
        const teamMembers = team.players.map(p => p.id);
        teamDataMap.set(team.id, teamMembers);
    });

    // Assign the completed teamdata to each player.
    room.players.forEach(player => {
        const playerTeamId = player.teamId;
        const playerTeamMembers = teamDataMap.get(playerTeamId);
        player.teamdata = {
            id: playerTeamMembers, // Array of team members' IDs
            tid: playerTeamId,     // The player's team ID
        };
    });
}



async function startMatch(room, roomId) {
  room.maxopentimeout = setTimeout(() => {
    closeRoom(roomId);
  }, room_max_open_time);

  await SetupRoomStartGameData(room);

  await setupRoomPlayers(room);
  await CreateTeams(room);

  playerchunkrenderer(room);
  SendPreStartMessage(room);

  try {
    room.intervalIds.push(
      setTimeout(() => {
        if (room.matchtype === "td") {
          const t1 = room.teams[0];
          const t2 = room.teams[1];
          room.scoreboard = [t1.id, t1.score].join("$");
        }

        room.state = "countdown";

        room.timeoutIds.push(
          setTimeout(() => {
            if (!rooms.has(roomId)) return;

            room.state = "playing";

            if (room.modifiers.has("countdown")) {
              const countdownDuration = room_max_open_time;
              const countdownStartTime = Date.now();

              room.countdownInterval = setInterval(() => {
                const elapsedTime = Date.now() - countdownStartTime;
                const remainingTime = countdownDuration - elapsedTime;

                if (remainingTime <= 0) {
                  clearInterval(room.countdownInterval);
                  room.countdown = "0:00";
                } else {
                  const minutes = Math.floor(remainingTime / 1000 / 60);
                  const seconds = Math.floor((remainingTime / 1000) % 60);
                  room.countdown = `${minutes}:${seconds
                    .toString()
                    .padStart(2, "0")}`;
                }
              }, 1000);
            }

            if (room.modifiers.has("HealingCircles"))
              initializeHealingCircles(room);
            if (room.modifiers.has("UseZone")) UseZone(room);
            if (room.modifiers.has("AutoHealthRestore"))
              startRegeneratingHealth(room, 1);
            if (room.modifiers.has("AutoHealthDamage"))
              startDecreasingHealth(room, 1);
          }, game_start_time)
        );
      }, 1000)
    );
  } catch (err) {
    console.error(`Error starting match in room ${roomId}:`, err);
  }
}

module.exports = { startMatch }