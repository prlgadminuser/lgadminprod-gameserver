"use strict";
require("module-alias/register");

const WebSocket = require("ws");
const http = require("http");
const axios = require("axios");
const { RateLimiterMemory } = require("rate-limiter-flexible");
const { rediskey } = require("@main/idbconfig");
const Redis = require("ioredis");

const SERVER_INSTANCE_ID = "xxxxxxxxxx".replace(/[xy]/g, function (c) {
  const r = (Math.random() * 16) | 0;
  const v = c === "x" ? r : (r & 0x3) | 0x8; // Ensures UUID version 4
  return v.toString(16);
});

const USER_KEY_PREFIX = "user:"; // user:<username> => serverId
const SERVER_USERS_PREFIX = "users:"; // users:<serverId> => hash of username -> sessionInfo
const SERVER_HEARTBEAT_PREFIX = "server_heartbeat:"; // Prefix for server heartbeat keys

const multiplier = 40;
const HEARTBEAT_INTERVAL_MS = 10000 * multiplier; // Send heartbeat periodically
const HEARTBEAT_TTL_SECONDS = (30000 * multiplier) / 1000; // Heartbeat expires (seconds) - SETEX uses seconds

const redisClient = new Redis(rediskey);
const sub = new Redis(rediskey);

sub.subscribe("bans", (err) => {
  if (err) console.error("Failed to subscribe:", err);
  else console.log("Subscribed to bans channel.");
});

sub.on("message", (c, username) => {
  //  console.log(`Ban event received for ${username}`);
  kickFromRoom(username);
});

const playerLookup = new Map();

function kickFromRoom(username) {
  const room = playerLookup.get(username);
  if (!room) return; // player not in any room

  if (!room.players.get(username)) return;
  RemovePlayerFromRoom(username); // drop their connection
}

function startHeartbeat() {
  setInterval(async () => {
    try {
      const heartbeatKey = `${SERVER_HEARTBEAT_PREFIX}${SERVER_INSTANCE_ID}`;
      // SETEX key seconds value
      await redisClient.setex(
        heartbeatKey,
        HEARTBEAT_TTL_SECONDS,
        Date.now().toString()
      );
    } catch (error) {
      console.error("Error sending heartbeat to Redis:", error);
    }
  }, HEARTBEAT_INTERVAL_MS);
}

// -------------------- Redis session helpers --------------------
// Sets both: user:<username> = serverId  AND HSET users:<serverId> username -> sessionInfo
async function addSession(username, serverId, sessionInfo = {}) {
  const userKey = `${USER_KEY_PREFIX}${username}`;
  const serverKey = `${SERVER_USERS_PREFIX}${serverId}`;
  const sessionValue =
    typeof sessionInfo === "string" ? sessionInfo : JSON.stringify(sessionInfo);

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
    await redisClient.del(userKey).catch(() => {});
    return;
  }
  const serverKey = `${SERVER_USERS_PREFIX}${serverId}`;

  const pipeline = redisClient.multi();
  pipeline.del(userKey);
  pipeline.hdel(serverKey, username);
  // optionally: if the server hash is now empty we can del it — we'll handle in cleanup or explicitly
  await pipeline.exec();
}

redisClient.on("connect", () => {
  console.log("Redis command client connected.");
  startHeartbeat();
});

redisClient.on("error", (err) =>
  console.error("Redis command client error:", err)
);

const ConnectionOptionsRateLimit = {
  points: 1, // Number of points
  duration: 1, // Per second
};
const rateLimiterConnection = new RateLimiterMemory(ConnectionOptionsRateLimit);

let connectedClientsCount = 0;

const server = http.createServer((req, res) => {
  try {
    if (!res) {
      req.destroy(); // Close the connection if res is undefined
      return;
    }

    // Set security headers
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Permissions-Policy", "interest-cohort=()");

    // Handle request and send a response
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("qs\n");
  } catch (error) {
    console.error("Error handling request:", error);
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Internal Server Error\n");
  }
});

const wss = new WebSocket.Server({
  noServer: true,
  clientTracking: false,
  perMessageDeflate: false,
  maxPayload: 10, // 10MB max payload (adjust according to your needs)
});

// Create a MongoClient with a MongoClientOptions object to set the Stable API version

module.exports = {
  axios,
  WebSocket,
  http,
  connectedClientsCount,
};

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

wss.on("connection", async (ws, req) => {
  // Made the connection handler async
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
      ws.close(4008, "maintenance"); // Then close after 10ms
      return;
    }

    // Parse URL and headers
    const [_, token, gamemode] = req.url.split("/");
    const origin = req.headers["sec-websocket-origin"] || req.headers.origin;

    // Validate request
    if (
      !token ||
      !gamemode ||
      gamemode.length > 20 ||
      req.url.length > 2000 ||
      (origin && origin.length > 50) ||
      !isValidOrigin(origin)
    ) {
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

    ws.username = username;

    // --- Use per-user key instead of big hash to check duplicates ---
    const userKey = `${USER_KEY_PREFIX}${username}`;
    const existingServerId = await redisClient.get(userKey);

    if (existingServerId) {
      const heartbeatKey = `${SERVER_HEARTBEAT_PREFIX}${existingServerId}`;
      const isExistingServerAlive = await redisClient.exists(heartbeatKey);

      if (isExistingServerAlive) {
        // User is connected to an active server, reject new connection
        ws.send(
          JSON.stringify({
            type: "error",
            message: `User "${username}" is already connected.`,
          })
        ); // Send error to client
        ws.close(4006, "code:double"); // Custom code for double login
        return;
      } else {
        // The existing server is NOT alive (heartbeat expired), so it crashed.
        // Clean up the stale session and allow this new connection.
        // Remove both user key and server hash entry if exist
        await removeSession(username);
      }
    }

    // Add user to per-server hash and per-user key
    await addSession(username, SERVER_INSTANCE_ID, { connectedAt: Date.now() });

    let joinResult;
    try {
      joinResult = await PlayerJoinRoom(ws, gamemode, playerVerified);
    } catch (err) {
      console.error("Error joining room:", err);
      // Clean up Redis session in case of join failure
      await removeSession(ws.username);
      ws.close(1011, "Internal server error");
      return;
    }

    if (!joinResult) {
      // Clean up Redis session in case of join failure
      await removeSession(ws.username);
      ws.close(4001, "Invalid token");
      return;
    }

    const player = joinResult.room.players.get(username);
    const room = joinResult.room;
    const roomId = joinResult.roomId;

    playerLookup.set(username, room);

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
        console.error("Error handling request:", error);
      }
    });

    ws.on("close", async () => {
      // Marked async for Redis operations
      playerLookup.delete(username);
      await removeSession(ws.username);
      if (player) {
        if (room && !player.eliminated) eliminatePlayer(room, player);
        RemovePlayerFromRoom(room, player);

        addEntryToKillfeed(room, 5, null, player.id, null);

        if (room.players.size < 1) {
          closeRoom(roomId);
          return;
        }

        if (room.grid) checkGameEndCondition(room);
      }
    });
  } catch (error) {
    console.error("Error during WebSocket connection handling:", error);

    ws.close(1011, "Internal server error");
  }
});

server.on("upgrade", (request, socket, head) => {
  (async () => {
    const ip =
      request.socket["true-client-ip"] ||
      request.socket["x-forwarded-for"] ||
      request.socket.remoteAddress;

    try {
      await rateLimiterConnection.consume(ip);

      const origin =
        request.headers["sec-websocket-origin"] || request.headers.origin;

      if (!isValidOrigin(origin)) {
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    } catch {
      socket.write("HTTP/1.1 429 Too Many Requests\r\n\r\n");
      socket.destroy();
    }
  })();
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  process.exit();
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection:", reason, promise);
  process.exit();
});

const { MongoClient, ServerApiVersion } = require("mongodb");
const { uri } = require("@main/idbconfig");

const mongoClient = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function ConnectToMongoDB() {
  try {
    await mongoClient.connect();
    console.log("Connected to MongoDB");
  } catch (err) {
    console.error("Error connecting to MongoDB:", err);
    process.exit(1);
  }
}

const db = mongoClient.db("Cluster0");
const DBuserCollection = db.collection("users");
const DBbattlePassCollection = db.collection("battlepass_users");
const DBshopCollection = db.collection("serverconfig");

module.exports = {
  db,
  DBuserCollection,
  DBbattlePassCollection,
  DBshopCollection,
};

const { verifyPlayer } = require("./src/Database/verifyPlayer");
const { checkForMaintenance } = require("./src/Database/ChangePlayerStats");
const { allowed_gamemodes } = require("./src/GameConfig/gamemodes");
const { PlayerJoinRoom } = require("./src/RoomHandler/AddPlayer");
const { handleRequest } = require("./src/Battle/NetworkLogic/HandleRequest");
const {
  eliminatePlayer,
  checkGameEndCondition,
} = require("./src/Battle/PlayerLogic/eliminated");
const { RemovePlayerFromRoom } = require("./src/RoomHandler/RemovePlayer");
const { addEntryToKillfeed } = require("./src/Battle/GameLogic/killfeed");
const { closeRoom } = require("./src/RoomHandler/closeRoom");

async function startServer() {
  // Wait for DB connection
  await ConnectToMongoDB();
  const PORT = process.env.PORT || 8070;
  server.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
  });
}

// Initialize
startServer();
