"use strict";

require("dotenv").config();
const http = require("http");
const WebSocket = require("ws");
const { RateLimiterMemory } = require("rate-limiter-flexible");

const {
  ALLOWED_ORIGINS,
  GAME_MODES,
  RATE_LIMITS,
  SERVER_INSTANCE_ID,
} = require("./config");

const { setupHttpServer } = require("./httpHandler");
const { verifyPlayer } = require("./src/database/verifyPlayer");
const { checkForMaintenance } = require("./src/database/ChangePlayerStats");
const {
  addSession,
  removeSession,
  checkExistingSession,
  redisClient,
  startHeartbeat,
} = require("./src/database/redisClient");
const { playerLookup, StartMatchmaking } = require("./src/room/room");
const { connectToMongoDB } = require("./src/database/mongoClient");
const { handleRoomMessage, handlePong } = require("./src/network/HandleMessage");
const RateLimiter = require("./src/utils/ratelimit");

const DEV_MODE = false;
const CONNECTION_RATE_LIMIT_ENABLED = false;
const IP_NO_DOUBLECONNECTION_ENABLED = false
const MAX_CONNECTED_PLAYERS = 60

// Rate limiter per IP
const connectionRateLimiter = new RateLimiterMemory(RATE_LIMITS.CONNECTION);

// Track IPs to prevent multiple connections from same IP
const activeIPs = new Map();
const activeSockets = new Set();


// ---------------- UTIL ----------------
function isValidOrigin(origin) {
  const trimmed = origin?.trim().replace(/(^,)|(,$)/g, "") ?? "";
  return ALLOWED_ORIGINS.has(trimmed);
}

async function handleUpgrade(req, socket, head, wss) {
  const ip =
    req.socket["true-client-ip"] ||
    req.socket["x-forwarded-for"] ||
    req.socket.remoteAddress;

  try {
    // Enforce connection rate limiting
    if (CONNECTION_RATE_LIMIT_ENABLED) await connectionRateLimiter.consume(ip);

    // Prevent multiple connections from the same IP
    if (IP_NO_DOUBLECONNECTION_ENABLED && activeIPs.has(ip) || global.playerCount > MAX_CONNECTED_PLAYERS) {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }

    const origin = req.headers["sec-websocket-origin"] || req.headers.origin;
    if (!isValidOrigin(origin)) {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
     if (IP_NO_DOUBLECONNECTION_ENABLED) activeIPs.set(ip, ws);
     if (IP_NO_DOUBLECONNECTION_ENABLED) ws.on("close", () => activeIPs.delete(ip));

       ws.lastPing = Date.now();  
    ws.rateLimiter = new RateLimiter({
    maxRequests: 20, // max requests per interval
    interval: 0.5, // in time seconds
  });

      wss.emit("connection", ws, req);
    });
  } catch (err) {
    socket.write("HTTP/1.1 429 Too Many Requests\r\n\r\n");
    socket.destroy();
  }
}

// ---------------- WEBSOCKET ----------------
function setupWebSocketServer(wss, server) {
  wss.on("connection", async (ws, req) => {
    let userId, player, room;

   activeSockets.add(ws);

    try {
      if (await checkForMaintenance()) {
        ws.send(JSON.stringify({ type: "error", message: "maintenance" }));
        ws.close(4008, "maintenance");
        return;
      }

      const [_, token, gamemode] = req.url.split("/");
      const origin = req.headers["sec-websocket-origin"] || req.headers.origin;

      if (!token || !gamemode || !GAME_MODES.has(gamemode) || !isValidOrigin(origin)) {
        ws.send("gamemode_not_allowed");
        ws.close(4004, "Unauthorized");
        return;
      }

      const playerVerified = await verifyPlayer(token);
      if (!playerVerified) {
        ws.close(4001, "Invalid token");
        return;
      }
      userId = playerVerified.userId;

      // Check for existing session
      let existingSid = playerLookup.has(userId)
        ? SERVER_INSTANCE_ID
        : await checkExistingSession(userId);

      if (existingSid) {
        if (existingSid === SERVER_INSTANCE_ID) {
          const existingConnection = playerLookup.get(userId);
          if (existingConnection && existingConnection.wsClose) {
            existingConnection.send("code:double");
            existingConnection.wsClose(4009, "Reassigned Connection");
            playerLookup.delete(userId);
          }
        } else {
          await redisClient.publish(
            `server:${existingSid}`,
            JSON.stringify({ type: "disconnect", uid: userId })
          );
        }
      }

      if (!DEV_MODE) await addSession(userId);

      const joinResult = StartMatchmaking(ws, gamemode, playerVerified);
      if (!joinResult) {
        if (!DEV_MODE) await removeSession(userId);
        ws.close(4001, "Invalid token");
        return;
      }

      playerLookup.set(userId, ws);
      global.playerCount++;

      ws.on("message", (message) => {

      message = message.toString("utf-8");
        
     if (!ws.rateLimiter.consume(1) || message.length > 10) {

        ws.close(4000, "message_limit_violated");
        return;
     } else {

      const type =  message.split(":")[0]

      if (type === "1") { // ping type

        ws.lastPing = Date.now();
        
      } else {

      if (ws.player && ws.room) handleRoomMessage(ws.room, ws.player, message)
        
      }
     }
});

      ws.on("close", async () => {
        activeSockets.delete(ws);
        playerLookup.delete(userId);
        if (ws.player && ws.room) ws.room.removePlayer(ws.player);
        if (!DEV_MODE) await removeSession(userId);
        global.playerCount--;
      });

      ws.on("error", (err) => {
        console.error("WebSocket error:", err);
        ws.close(1011, "Internal server error");
      });
    } catch (error) {
      console.error("WS connection error:", error);
      ws.close(1011, "Internal server error");
    }
  });

  server.on("upgrade", (req, socket, head) => {
    if (!req.url || req.url.length > 300) {
      socket.destroy();
      return;
    }
    handleUpgrade(req, socket, head, wss);
  });
}

// ---------------- SERVER START ----------------
async function startServer() {
  try {
    await connectToMongoDB();
    startHeartbeat();

    const server = http.createServer(setupHttpServer);
    const wss = new WebSocket.Server({
      noServer: true,
      clientTracking: false,
      perMessageDeflate: false,
      maxPayload: 10,
    });

    setupWebSocketServer(wss, server);

    const PORT = process.env.PORT || 8080;
    server.listen(PORT, () => {
      console.log(`Skilldown GameServer listening on port ${PORT}`);
    });

    // Graceful shutdown
    const shutdown = () => {
      console.log("Server shutting down...");
      server.close(() => process.exit(0));
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    process.on("uncaughtException", (err) => handleFatal(err));
    process.on("unhandledRejection", (reason) => handleFatal(reason));
  } catch (err) {
    handleFatal(err);
  }
}

setInterval(() => {
  const now = Date.now();
  for (const ws of activeSockets) {
 //   if (!ws.lastPing) continue;

    if (now - ws.lastPing > 8000) {
     // console.log("Terminating idle socket");
      ws.close(4000, "ping_timeout");
      activeSockets.delete(ws);
    }
  }
}, 5000);


function handleFatal(err) {
  console.error("Fatal error:", err);
  process.exit(1);
}

startServer();
