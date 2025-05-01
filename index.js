"use strict";

const testmode = true

const WebSocket = require("ws");
const http = require('http');
const axios = require("axios");
const LZString = require("lz-string")
const { MongoClient, ServerApiVersion } = require("mongodb");
const jwt = require("jsonwebtoken");
const { RateLimiterMemory } = require("rate-limiter-flexible");
const { uri } = require("./idbconfig");
const msgpack = require("msgpack-lite");


function compressMessage(msg) {
  //const encoded = msgpack.encode(FinalPreMessage)
  //const encoded = LZString.compressToUint8Array(FinalPreMessage)
  const encoded = msgpack.encode(msg)
  return encoded
}



const ConnectionOptionsRateLimit = {
  points: 1, // Number of points
  duration: 1, // Per second
};

let connectedClientsCount = 0;
let connectedUsernames = new Set();

const rateLimiterConnection = new RateLimiterMemory(ConnectionOptionsRateLimit);

const server = http.createServer((req, res) => {
  try {
    if (!res) {
      req.destroy(); // Close the connection if res is undefined
      return;
    }

    // Set security headers
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'interest-cohort=()');

    // Handle request and send a response
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('qs\n');
  } catch (error) {
    console.error('Error handling request:', error);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal Server Error\n');
  }
});

const wss = new WebSocket.Server({
  noServer: true,
  clientTracking: false,
  perMessageDeflate: false,
  /* perMessageDeflate: {
     zlibDeflateOptions: {
       chunkSize: 1024,
       memLevel: 7,
       level: 3,
     },
     zlibInflateOptions: {
       chunkSize: 10 * 1024,
     },
     serverMaxWindowBits: 10,
     concurrencyLimit: 10,
     threshold: 1024,  // Only compress messages larger than 1KB
   },
 
 */
  //proxy: true,
  maxPayload: 10, // 10MB max payload (adjust according to your needs)
});


const Limiter = require("limiter").RateLimiter;


// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
    //   maxConnecting: 2,
    // maxIdleTimeMS: 300000,
    // maxPoolSize: 100,
    //minPoolSize: 0,
  },
});

async function startServer() {
  try {

    await client.connect();
    console.log("Connected to MongoDB");

  } catch (err) {
    console.error("Error connecting to MongoDB:", err);
  }
}

if (!testmode) {
  startServer();
}

const db = client.db("Cluster0");
const userCollection = db.collection("users");
const battlePassCollection = db.collection("battlepass_users");
const shopcollection = db.collection("serverconfig");


module.exports = {
  axios,
  Limiter,
  WebSocket,
  http,
  connectedClientsCount,
  MongoClient,
  ServerApiVersion,
  db,
  userCollection,
  battlePassCollection,
  shopcollection,
  jwt,
  msgpack,
  LZString,
  compressMessage,
};


const {
  joinRoom,
  closeRoom,
  handleRequest,
  RemoveRoomPlayer,
} = require("./globalhandler/room");

const {
  increasePlayerDamage,
  increasePlayerKills,
  increasePlayerPlace,
  increasePlayerWins,
  verifyPlayer,
  checkForMaintenance,
} = require("./globalhandler/dbrequests");

const { game_win_rest_time, maxClients, gamemodeconfig, allowed_gamemodes } = require("./globalhandler/config");
const { addKillToKillfeed } = require('./globalhandler/killfeed')
const { endGame } = require('./globalhandler/game')

const allowedOrigins = [
  "https://slcount.netlify.app",
  "https://slgame.netlify.app",
  "https://serve.gamejolt.net",
  "http://serve.gamejolt.net",
  "tw-editor://.",
  "https://html-classic.itch.zone",
  "null",
  "https://turbowarp.org",
  "https://liquemgames.itch.io/sr",
  "https://s-r.netlify.app",
  "https://uploads.ungrounded.net",
  "https://prod-dpgames.crazygames.com",
  "https://crazygames.com",
  "https://crazygames.com/game/skilled-royale",
  "https://skilldown.netlify.app",
];

function isValidOrigin(origin) {
  const trimmedOrigin = origin.trim().replace(/(^,)|(,$)/g, "");
  return allowedOrigins.includes(trimmedOrigin);
}


async function handlePlayerVerification(token) {
  const playerVerified = await verifyPlayer(token);
  if (!playerVerified) {
    return false;  // Optional: To indicate verification failure
  }
  return playerVerified;  // Optional: To indicate successful verification
}

wss.on("connection", (ws, req) => {
  try {
    if (connectedClientsCount > maxClients - 1) {
      ws.close(4034, "code:full");
      return;
    }
    // Check for maintenance mode
    checkForMaintenance()
      .then(isMaintenance => {
        if (isMaintenance) {
          ws.close(4008, "maintenance");
          return;
        }
        // Parse URL and headers
        const [_, token, gamemode] = req.url.split('/');
        const origin = req.headers["sec-websocket-origin"] || req.headers.origin;

        
        // Validate request
        if (gamemode.length > 20 || req.length > 2000 || (origin && origin.length > 50) || !isValidOrigin(origin)) {
          ws.close(4004, "Unauthorized");
          return;
        }

        if (!(token && token.length < 300 && allowed_gamemodes.has(gamemode))) {
          ws.close(4094, "Unauthorized");
          // console.log("Invalid token or gamemode");
          return;
        }

        // Verify player token
        handlePlayerVerification(token).then(playerVerified => {
          if (!playerVerified) {
            ws.close(4001, "Invalid token");
            return;
          }

          if (connectedUsernames.has(playerVerified.playerId)) {
            ws.close(4006, "code:double");
            return;
          }

          // Join room and handle connection
          joinRoom(ws, gamemode, playerVerified).then(result => {
            if (!result) {
              ws.close(4001, "Invalid token");
              return;
            }

            const room = result.room

            const player = room.players.get(result.playerId);
            connectedClientsCount++;
            connectedUsernames.add(playerVerified.playerId);
            //  console.log(connectedUsernames);

            ws.on("message", (message) => {

              if (!player.rateLimiter.tryRemoveTokens(1) || message.length > 10) return;

              const compressedBinary = message.toString("utf-8"); // Convert Buffer to string

              try {
                const parsedMessage = compressedBinary;


                if (player) {
                  handleRequest(result, parsedMessage);
                }
              } catch (error) {
                console.error('Error handling request:', error);
              }

            });

            ws.on('close', () => {
              const player = room.players.get(result.playerId);
              if (player) {
                RemoveRoomPlayer(room, player)

                connectedClientsCount--;
                connectedUsernames.delete(player.playerId);

                console.log(room)

                if (room.players.size < 1) {
                  closeRoom(result.roomId);
                  console.log('Room closed');
                  return;
                }

                if (room.state === "playing" && room.winner === -1) {
                  // Get all remaining teams that have at least one active player
                  let remainingTeams = room.teams.filter(team =>
                    team.players.some(playerId => {
                      const player1 = room.players.get(playerId.playerId);
                      return player1 && !player.eliminated;
                    })
                  );
                  // If only one team remains
                  if (remainingTeams.length === 1) {
                    const winningTeam = remainingTeams[0];

                    // Filter active players in the winning team (those who are not eliminated)
                    const activePlayers = winningTeam.players.filter(player => {
                      const roomPlayer = room.players.get(player.playerId);
                      return roomPlayer && (roomPlayer.eliminated === false || roomPlayer.eliminated == null);
                    });


                    // If only one active player is left in the winning team
                    if (activePlayers.length === 1) {
                      const winner = room.players.get(activePlayers[0].playerId); // Get the player object
                      room.winner = [winner.nmb].join('$'); // Set the winner's ID
                    } else {
                      room.winner = winningTeam.id; // Set winner by team ID
                    }

                    // Awarding victory to all players in the winning team
                    winningTeam.players.forEach(player => {
                      const teamplayer = room.players.get(player.playerId); // Access the player data using playerId

                      if (teamplayer) {
                        teamplayer.place = 1
                        increasePlayerWins(teamplayer.playerId, 1); // Increase wins for the player
                        increasePlayerPlace(teamplayer.playerId, 1, room);
                      } // Increase place for the player
                    });

                    // Add the winning team to eliminated teams with place 1
                    room.eliminatedTeams.push({
                      teamId: winningTeam.id,
                      place: 1
                    });

                    // End the game after a short delay
                  //  console.log("closing room")

                   // result.room.timeoutIds.push(setTimeout(() => closeRoom(result.roomId), game_win_rest_time));
                  }
                }


              }


            })
          });
        }).catch(err => {
          console.error("Error joining room:", err);
          ws.close(1011, "Internal server error");
        });
      }).catch(err => {
        console.error("Error verifying player:", err);
        ws.close(1011, "Internal server error");
      });
  } catch (error) {
    console.error("Error during WebSocket connection handling:", error);
    ws.close(1011, "Internal server error");
  }
});


server.on("upgrade", (request, socket, head) => {
  (async () => {
    const ip = request.socket["true-client-ip"] || request.socket["x-forwarded-for"] || request.socket.remoteAddress;

    try {
     // await rateLimiterConnection.consume(ip);

      const origin = request.headers["sec-websocket-origin"] || request.headers.origin;

      if (!isValidOrigin(origin)) {
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    } catch {
      socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n');
      socket.destroy();
    }
  })();
});


process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection:", reason, promise);
});


const PORT = process.env.PORT || 8070;
server.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});


