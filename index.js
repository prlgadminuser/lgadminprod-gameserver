"use strict";

const testmode = true

const WebSocket = require("ws");
const http = require('http');
const axios = require("axios");
const LZString = require("lz-string")
const { MongoClient, ServerApiVersion } = require("mongodb");
const jwt = require("jsonwebtoken");
const { RateLimiterMemory } = require("rate-limiter-flexible");
const { uri, rediskey } = require("./idbconfig");
const msgpack = require("msgpack-lite");
const Redis = require('ioredis');

const SERVER_INSTANCE_ID = 'xxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8); // Ensures UUID version 4
    return v.toString(16);
  });

// ------------------------------------------------------------
// Removed monolithic USER_SESSION_MAP_KEY
// Use per-user key + per-server hash:
//   user:<username> => serverId
//   users:<serverId> => HSET username -> sessionData (stringified or simple timestamp)
// ------------------------------------------------------------
const USER_KEY_PREFIX = 'user:';         // user:<username> => serverId
const SERVER_USERS_PREFIX = 'users:';    // users:<serverId> => hash of username -> sessionInfo
const SERVER_HEARTBEAT_PREFIX = 'server_heartbeat:'; // Prefix for server heartbeat keys

const multiplier = 40
const HEARTBEAT_INTERVAL_MS = 10000 * multiplier; // Send heartbeat periodically
const HEARTBEAT_TTL_SECONDS = (30000 * multiplier) / 1000;   // Heartbeat expires (seconds) - SETEX uses seconds
const CLEANUP_INTERVAL_MS = 60000 * multiplier;  // Run stale session cleanup periodically

const redisClient = new Redis(rediskey);

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
    console.log('Redis command client connected.');
    // Start sending heartbeats once connected to Redis
    startHeartbeat();
    // Start periodic stale session cleanup
    setInterval(cleanStaleSessions, CLEANUP_INTERVAL_MS);
    console.log(`Stale session cleanup scheduled every ${CLEANUP_INTERVAL_MS / 1000} seconds.`);
});

redisClient.on('error', (err) => console.error('Redis command client error:', err));

function startHeartbeat() {
    setInterval(async () => {
        try {
            const heartbeatKey = `${SERVER_HEARTBEAT_PREFIX}${SERVER_INSTANCE_ID}`;
            // SETEX key seconds value
            await redisClient.setex(heartbeatKey, HEARTBEAT_TTL_SECONDS, Date.now().toString());
        } catch (error) {
            console.error('Error sending heartbeat to Redis:', error);
        }
    }, HEARTBEAT_INTERVAL_MS);
}

// -------------------- Redis session helpers --------------------
// Sets both: user:<username> = serverId  AND HSET users:<serverId> username -> sessionInfo
async function addSession(username, serverId, sessionInfo = {}) {
    const userKey = `${USER_KEY_PREFIX}${username}`;
    const serverKey = `${SERVER_USERS_PREFIX}${serverId}`;
    const sessionValue = typeof sessionInfo === 'string' ? sessionInfo : JSON.stringify(sessionInfo);

    const pipeline = redisClient.multi();
    pipeline.set(userKey, serverId);
    pipeline.hset(serverKey, username, sessionValue);
    await pipeline.exec();
}

// Removes a single user's session — deletes user:<username> and removes from users:<serverId>
async function removeSession(username) {
    const userKey = `${USER_KEY_PREFIX}${username}`;
    const serverId = await redisClient.get(userKey);
    if (!serverId) {
        // nothing to remove
        await redisClient.del(userKey).catch(()=>{});
        return;
    }
    const serverKey = `${SERVER_USERS_PREFIX}${serverId}`;

    const pipeline = redisClient.multi();
    pipeline.del(userKey);
    pipeline.hdel(serverKey, username);
    // optionally: if the server hash is now empty we can del it — we'll handle in cleanup or explicitly
    await pipeline.exec();
}

// Deletes all sessions belonging to a serverId quickly:
// 1) HKEYS users:<serverId> to get usernames
// 2) DEL users:<serverId> and DEL user:<username> for each member (pipelined)
async function removeSessionsByServerId(targetServerId) {
    try {
        const serverKey = `${SERVER_USERS_PREFIX}${targetServerId}`;

        // Get usernames on this server
        const usernames = await redisClient.hkeys(serverKey);

        if (!usernames || usernames.length === 0) {
            // There may still be a key with no fields; just DEL the serverKey to be safe
            const deleted = await redisClient.del(serverKey);
            if (deleted) {
                console.log(`Removed empty server key for ${targetServerId}.`);
            } else {
                console.log(`No sessions found for serverId ${targetServerId}.`);
            }
            return;
        }

        const pipeline = redisClient.multi();
        // Remove per-user keys and the server hash
        usernames.forEach(username => {
            pipeline.del(`${USER_KEY_PREFIX}${username}`);
        });
        pipeline.del(serverKey);
        await pipeline.exec();

        console.log(`Removed ${usernames.length} sessions for serverId ${targetServerId}.`);
    } catch (error) {
        console.error(`Error removing sessions for serverId ${targetServerId}:`, error);
    }
}

// cleanStaleSessions: iterate over server user hashes (users:*), check heartbeat for each serverId.
// If heartbeat missing => server is down => delete users:<serverId> and each user:<username>
async function cleanStaleSessions() {
    try {
        // Use scanStream to avoid blocking Redis (production-friendly)
        const pattern = `${SERVER_USERS_PREFIX}*`;
        const stream = redisClient.scanStream({ match: pattern, count: 100 });

        let totalCleaned = 0;
        const promises = [];

        stream.on('data', async (resultKeys) => {
            // resultKeys is an array of keys matching `users:*`
            for (const serverKey of resultKeys) {
                const serverId = serverKey.slice(SERVER_USERS_PREFIX.length); // strip prefix
                const heartbeatKey = `${SERVER_HEARTBEAT_PREFIX}${serverId}`;
                const isAlive = await redisClient.exists(heartbeatKey);
                if (!isAlive) {
                    // server dead -> remove all sessions of that server
                    promises.push((async () => {
                        const usernames = await redisClient.hkeys(serverKey);
                        if (usernames.length > 0) {
                            const pipeline = redisClient.multi();
                            usernames.forEach(u => pipeline.del(`${USER_KEY_PREFIX}${u}`));
                            pipeline.del(serverKey);
                            await pipeline.exec();
                            totalCleaned += usernames.length;
                        } else {
                            // just delete the empty hash
                            const delCount = await redisClient.del(serverKey);
                            if (delCount) {
                                // treated as cleaned (zero usernames)
                            }
                        }
                    })());
                }
            }
        });

        await new Promise((resolve, reject) => {
            stream.on('end', resolve);
            stream.on('error', reject);
        });

        // wait for all deletions to finish
        await Promise.all(promises);

        if (totalCleaned > 0) {
            console.log(`Completed periodic cleanup. Cleaned ${totalCleaned} stale sessions.`);
        }
    } catch (error) {
        console.error('Error during periodic stale session cleanup:', error);
    }
}
// -------------------- end Redis session helpers --------------------

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
  maxPayload: 10, // 10MB max payload (adjust according to your needs)
});

const Limiter = require("limiter").RateLimiter;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
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

const { game_win_rest_time, allowed_gamemodes } = require("./globalhandler/config");

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
  const trimmedOrigin = origin ? origin.trim().replace(/(^,)|(,$)/g, "") : "";
  return allowedOrigins.includes(trimmedOrigin);
}

async function handlePlayerVerification(token) {
  const playerVerified = await verifyPlayer(token);
  if (!playerVerified) {
    return false;
  }
  return playerVerified;
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
        if (!token || !gamemode || gamemode.length > 20 || req.url.length > 2000 || (origin && origin.length > 50) || !isValidOrigin(origin)) {
            ws.close(4004, "Unauthorized");
            return;
        }

        if (token.length > 300) {
            ws.close(4094, "Unauthorized");
            return;
        }

        if (!allowed_gamemodes.has(gamemode)) {
             ws.send("gamemode_unvailable");
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

        // --- Use per-user key instead of big hash to check duplicates ---
        const userKey = `${USER_KEY_PREFIX}${username}`;
        const existingServerId = await redisClient.get(userKey);

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
                // Remove both user key and server hash entry if exist
                await removeSession(username);
            }
        }

        // If we reach here, either the user was not connected, or their previous session was stale.
        wsToUsername.set(username); // Map WebSocket instance to username

        // Add user to per-server hash and per-user key
        await addSession(username, SERVER_INSTANCE_ID, { connectedAt: Date.now() });

        let joinResult;
        try {
            joinResult = await joinRoom(ws, gamemode, playerVerified);
        } catch (err) {
            console.error("Error joining room:", err);
            // Clean up Redis session in case of join failure
            await removeSession(username);
            ws.close(1011, "Internal server error");
            return;
        }

        if (!joinResult) {
            // Clean up Redis session in case of join failure
            await removeSession(username);
            ws.close(4001, "Invalid token");
            return;
        }

        const player = joinResult.room.players.get(joinResult.playerId);

        ws.on("message", (message) => {
            if (!player || !player.rateLimiter) return;
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
            const currentUser = wsToUsername.get(username); // Get username from local map
            if (currentUser) {
                wsToUsername.delete(username); // Remove from local WebSocket map

                // Remove user from per-user key and per-server hash
                await removeSession(currentUser);
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
        try { ws.close(1011, "Internal server error"); } catch {}
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
