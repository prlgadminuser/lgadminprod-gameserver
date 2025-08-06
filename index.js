"use strict";

const testmode = true

const WebSocket = require("ws");
const http = require('http');
const axios = require("axios");
const LZString = require("lz-string")
const { MongoClient, ServerApiVersion } = require("mongodb");
const jwt = require("jsonwebtoken");
const { RateLimiterMemory } = require("rate-limiter-flexible");
const { uri, DB_NAME } = require("./idbconfig");
const msgpack = require("msgpack-lite");
const Redis = require('ioredis');

const SERVER_INSTANCE_ID = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8); // Ensures UUID version 4
    return v.toString(16);
  });

const REDIS_HOST = '127.0.0.1'; // Adjust if Redis is on a different host
const REDIS_PORT = 6379;         // Adjust if Redis is on a different port
const REDIS_CHANNEL = 'user_status_updates'; // Channel for Pub/Sub (for inter-server cleanup notifications)
const USER_SESSION_MAP_KEY = 'user_to_server_map'; // Redis Hash key for user -> server mapping
const SERVER_HEARTBEAT_PREFIX = 'server_heartbeat:'; // Prefix for server heartbeat keys
const HEARTBEAT_INTERVAL_MS = 60000; // Send heartbeat every 5 seconds
const HEARTBEAT_TTL_SECONDS = 180;   // Heartbeat expires after 15 seconds (should be > interval)
const CLEANUP_INTERVAL_MS = 360000;  // Run stale session cleanup every 30 seconds (must be > HEARTBEAT_TTL_SECONDS)

const redisClient = new Redis("rediss://default:ATBeAAIncDE4ZGNmMDlhNGM0MTI0YTljODU4YzhhZTg3NmFjMzk3YnAxMTIzODI@talented-dassie-12382.upstash.io:6379");


function compressMessage(msg) {

  return msgpack.encode(msg);
}



const ConnectionOptionsRateLimit = {
  points: 1, // Number of points
  duration: 1, // Per second
};

let connectedClientsCount = 0;
const wsToUsername = new Map();


redisClient.on('connect', () => {
    console.log('Redis command client connected to Upstash.');
    // Start sending heartbeats once connected to Redis
    startHeartbeat();
    // Start periodic stale session cleanup
    setInterval(cleanStaleSessions, CLEANUP_INTERVAL_MS);
    console.log(`Stale session cleanup scheduled every ${CLEANUP_INTERVAL_MS / 1000} seconds.`);
});

redisClient.on('error', (err) => console.error('Redis command client error:', err));


function startHeartbeat() {
    // Use redisClient for SETEX command
    setInterval(async () => {
        try {
            const heartbeatKey = `${SERVER_HEARTBEAT_PREFIX}${SERVER_INSTANCE_ID}`;
            await redisClient.setex(heartbeatKey, HEARTBEAT_TTL_SECONDS, Date.now().toString());
            // console.log(`Heartbeat sent for ${SERVER_INSTANCE_ID}`); // Uncomment for verbose logging
        } catch (error) {
            console.error('Error sending heartbeat to Redis:', error);
        }
    }, HEARTBEAT_INTERVAL_MS);
}

/**
 * Iterates through the user_to_server_map in Redis to identify and clean up stale user sessions.
 * This function runs on a dedicated interval.
 */
async function cleanStaleSessions() {
    try {
        // Use redisClient for HGETALL, EXISTS, HDEL commands
        const userToServerMap = await redisClient.hgetall(USER_SESSION_MAP_KEY);
        let cleanedCount = 0;

        for (const username in userToServerMap) {
            const serverId = userToServerMap[username];
            const heartbeatKey = `${SERVER_HEARTBEAT_PREFIX}${serverId}`;
            const isServerAlive = await redisClient.exists(heartbeatKey);

            if (!isServerAlive) {
                // Server is not alive, remove this stale session
                await redisClient.hdel(USER_SESSION_MAP_KEY, username);
                cleanedCount++;
            }
        }
        if (cleanedCount > 0) {
            console.log(`Completed periodic cleanup. Cleaned ${cleanedCount} stale sessions.`);
        }
    } catch (error) {
        console.error('Error during periodic stale session cleanup:', error);
    }
}


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
  handleRequest,
  RemoveRoomPlayer,
} = require("./globalhandler/room");

const {
  closeRoom,
} = require("./roomhandler/manager");

const {
  increasePlayerPlace,
  increasePlayerWins,
  verifyPlayer,
  checkForMaintenance,
} = require("./globalhandler/dbrequests");

const { game_win_rest_time, maxClients, gamemodeconfig, allowed_gamemodes } = require("./globalhandler/config");

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

wss.on("connection", async (ws, req) => { // Made the connection handler async
    try {
        let isMaintenance;
        try {
            isMaintenance = await checkForMaintenance();
        } catch (err) {
            console.error("Error checking for maintenance:", err);
            ws.close(1011, "Internal server error");
            return;
        }

        if (isMaintenance) {
            ws.send("matchmaking_disabled"); // First send a message
            setTimeout(() => {
                ws.close(4008, "maintenance"); // Then close after 10ms
            }, 10);
            return;
        }

        // Parse URL and headers
        const [_, token, gamemode] = req.url.split('/');
        const origin = req.headers["sec-websocket-origin"] || req.headers.origin;

        // Validate request
        if (gamemode.length > 20 || req.url.length > 2000 || (origin && origin.length > 50) || !isValidOrigin(origin)) {
            ws.close(4004, "Unauthorized");
            return;
        }

        if (!(token && token.length < 300 && allowed_gamemodes.has(gamemode))) {
            ws.close(4094, "Unauthorized");
            return;
        }

        let playerVerified;
        try {
            playerVerified = await handlePlayerVerification(token);
        } catch (err) {
            console.error("Error verifying player:", err);
            ws.close(1011, "Internal server error");
            return;
        }

        if (!playerVerified) {
            ws.close(4001, "Invalid token");
            return;
        }

        const username = playerVerified.playerId; // Use playerId as the unique username

        // --- Start Redis-based duplicate user check ---
        // Use redisClient for HGET and EXISTS commands
        const existingServerId = await redisClient.hget(USER_SESSION_MAP_KEY, username);

        if (existingServerId) {
            const heartbeatKey = `${SERVER_HEARTBEAT_PREFIX}${existingServerId}`;
            const isExistingServerAlive = await redisClient.exists(heartbeatKey);

            if (isExistingServerAlive) {
                // User is connected to an active server, reject new connection
                ws.send(JSON.stringify({ type: 'error', message: `User "${username}" is already connected.` })); // Send error to client
                ws.close(4006, "code:double"); // Custom code for double login
                return;
            } else {
                // The existing server is NOT alive (heartbeat expired), so it crashed.
                // Clean up the stale session and allow this new connection.
                await redisClient.hdel(USER_SESSION_MAP_KEY, username);
                // Publish an update to notify other servers about the cleanup (using redisClient)
            }
        }
        // --- End Redis-based duplicate user check ---

        // If we reach here, either the user was not connected, or their previous session was stale.
        // Authenticate and store the user locally
        wsToUsername.set(ws, username); // Map WebSocket instance to username

        // Add user to the global user_to_server_map in Redis (using redisClient)
        await redisClient.hset(USER_SESSION_MAP_KEY, username, SERVER_INSTANCE_ID);

        let joinResult;
        try {
            joinResult = await joinRoom(ws, gamemode, playerVerified);
        } catch (err) {
            console.error("Error joining room:", err);
            ws.close(1011, "Internal server error");
            return;
        }

        if (!joinResult) {
            ws.close(4001, "Invalid token");
            return;
        }

        const player = joinResult.room.players.get(joinResult.playerId);

        ws.on("message", (message) => {
            // This part remains largely unchanged, as it handles in-game messages
            // and is separate from the initial connection/auth logic.
            if (!player.rateLimiter.tryRemoveTokens(1) || message.length > 10) return;

            const compressedBinary = message.toString("utf-8"); // Convert Buffer to string

            try {
                const parsedMessage = compressedBinary;

                if (player) {
                    handleRequest(joinResult, parsedMessage);
                }
            } catch (error) {
                console.error('Error handling request:', error);
            }
        });

        ws.on('close', async () => { // Marked async for Redis operations
            const currentUser = wsToUsername.get(ws); // Get username from local map
            if (currentUser) {
                wsToUsername.delete(ws); // Remove from local WebSocket map

                // Remove user from the global user_to_server_map in Redis (using redisClient)
                await redisClient.hdel(USER_SESSION_MAP_KEY, currentUser);

                // Removed: Publish user leave event to Redis Pub/Sub channel
                // await redisClient.publish(REDIS_CHANNEL, JSON.stringify({ type: 'left', username: currentUser }));
            }

            // --- Original game logic for room cleanup on close ---
            const player = joinResult.room.players.get(joinResult.playerId);
            if (player) {
                RemoveRoomPlayer(joinResult.room, player)

                if (joinResult.room.players.size < 1) {
                    closeRoom(joinResult.roomId);
                    return;
                }

                if (joinResult.room.state === "playing" && joinResult.room.winner === -1) {
                    let remainingTeams = joinResult.room.teams.filter(team =>
                        team.players.some(playerId => {
                            const player1 = joinResult.room.players.get(playerId.playerId);
                            return player1 && !player.eliminated;
                        })
                    );

                    if (remainingTeams.length === 1) {
                        const winningTeam = remainingTeams[0];

                        const activePlayers = winningTeam.players.filter(player => {
                            const roomPlayer = joinResult.room.players.get(player.playerId);
                            return roomPlayer && (roomPlayer.eliminated === false || roomPlayer.eliminated == null);
                        });

                        if (activePlayers.length === 1) {
                            const winner = joinResult.room.players.get(activePlayers[0].playerId);
                            joinResult.room.winner = [winner.nmb].join('$');
                        } else {
                            joinResult.room.winner = winningTeam.id;
                        }

                        winningTeam.players.forEach(player => {
                            const teamplayer = joinResult.room.players.get(player.playerId);
                            if (teamplayer) {
                                teamplayer.place = 1
                                increasePlayerWins(teamplayer.playerId, 1);
                                increasePlayerPlace(teamplayer.playerId, 1, joinResult.room);
                            }
                        });

                        joinResult.room.eliminatedTeams.push({
                            teamId: winningTeam.id,
                            place: 1
                        });

                        joinResult.room.timeoutIds.push(setTimeout(() => {
                            closeRoom(joinResult.roomId);
                        }, game_win_rest_time));
                    }
                }
            }
        })
    } catch (error) {
        console.error("Error during WebSocket connection handling:", error);
        ws.close(1011, "Internal server error");
    }
});

server.on("upgrade", (request, socket, head) => {
  (async () => {
    const ip = request.socket["true-client-ip"] || request.socket["x-forwarded-for"] || request.socket.remoteAddress;

    try {
      await rateLimiterConnection.consume(ip);

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
   process.exit()
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection:", reason, promise);
    process.exit()
});

process.on('SIGINT', () => {
    console.log('SIGINT signal received. Closing WebSocket and Redis connection.');
    wss.close(() => {
        redisClient.quit();
        process.exit(0);
    });
});


const PORT = process.env.PORT || 8070;
server.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});


