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
  kickPlayerNewConnection,
} = require("./src/database/redisClient");

const { handleMessage } = require("./src/packets/HandleMessage");
const { playerLookup, GetRoom } = require("./src/room/room");

const { connectToMongoDB } = require("./src/database/mongoClient");

// ===================================================
// =================== CONSTANTS ====================
// ===================================================



const CONNECTION_RATE_LIMIT_ENABLED = false;
const DEV_MODE = false;

const connectionRateLimiter = new RateLimiterMemory(RATE_LIMITS.CONNECTION);
let playerCount = 0;

// ===================================================
// ================== UTIL FUNCTIONS ================
// ===================================================

function isValidOrigin(origin) {
  const trimmed = origin?.trim().replace(/(^,)|(,$)/g, "") ?? "";
  return ALLOWED_ORIGINS.has(trimmed);
}

async function handleUpgrade(request, socket, head, wss) {
  const ip =
    request.socket["true-client-ip"] ||
    request.socket["x-forwarded-for"] ||
    request.socket.remoteAddress;

  try {
    if (CONNECTION_RATE_LIMIT_ENABLED) await connectionRateLimiter.consume(ip);

    const origin = request.headers["sec-websocket-origin"] || request.headers.origin;
    if (!isValidOrigin(origin)) {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) =>
      wss.emit("connection", ws, request)
    );
  } catch {
    socket.write("HTTP/1.1 429 Too Many Requests\r\n\r\n");
    socket.destroy();
  }
}

// ===================================================
// =============== WEBSOCKET HANDLER =================
// ===================================================

function setupWebSocketServer(wss, server) {
  wss.on("connection", async (ws, req) => {
    let userId, player, room;

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

      userId = playerVerified.userId

    //  console.log(userId)

      // Handle existing sessions
      let existingSid = playerLookup.has(userId)
        ? SERVER_INSTANCE_ID
        : await checkExistingSession(userId);

      if (existingSid) {
        if (existingSid === SERVER_INSTANCE_ID) {
          const existingConnection = playerLookup.get(userId);
          if (existingConnection) {
            existingConnection.send("code:double");
            existingConnection.wsClose(4009, "Reasigned Connection");
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

      const joinResult = await GetRoom(ws, gamemode, playerVerified);
      if (!joinResult) {
        if (!DEV_MODE) await removeSession(userId);
        ws.close(4001, "Invalid token or room full");
        return;
      }

      room = joinResult.room;
      const playerId = userId;
      player = room.players.get(playerId);

      playerLookup.set(userId, ws);
      playerCount++;

      ws.on("message", (message) => handleMessage(room, player, message));

      ws.on("close", async () => {
        playerLookup.delete(userId);
        if (player) player.room.removePlayer(player);
        if (!DEV_MODE) await removeSession(userId);
        playerCount--;
      });

      ws.on("error", (error) => {
        console.error("WebSocket error:", error);
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

// ===================================================
// ================== SERVER START ==================
// ===================================================

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
      console.log(`Skilldown GameServer is listening on port ${PORT}`);
    });

    // Graceful shutdown
    process.on("SIGINT", () => shutdown(server));
    process.on("SIGTERM", () => shutdown(server));
    process.on("uncaughtException", (err) => handleFatal(err));
    process.on("unhandledRejection", (reason) => handleFatal(reason));

  } catch (error) {
    handleFatal(error);
  }
}

function shutdown(server) {
  console.log("Server shutting down...");
  server.close(() => process.exit(0));
}

function handleFatal(error) {
  console.error("Fatal error:", error);
  process.exit(1);
}

startServer();
