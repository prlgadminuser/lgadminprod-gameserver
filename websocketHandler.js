// src/handlers/webSocketHandler.js
const { RateLimiterMemory } = require("rate-limiter-flexible");
const { ALLOWED_ORIGINS, GAME_MODES, RATE_LIMITS, playerCount } = require("@main/config");
const { verifyPlayer } = require("@src/Database/verifyPlayer");
const { checkForMaintenance } = require("@src/Database/ChangePlayerStats");
const { addSession, removeSession, checkExistingSession } = require("@src/Database/redisClient");
const { AddPlayerToRoom } = require("./src/RoomHandler/AddPlayer");
const { handleMessage } = require("./src/Battle/NetworkLogic/HandleMessage");
const { playerLookup } = require("./src/RoomHandler/setup");
const { RemovePlayerFromRoom } = require("./src/RoomHandler/RemovePlayer");

const connectionRateLimiter = new RateLimiterMemory(RATE_LIMITS.CONNECTION);

function isValidOrigin(origin) {
  const trimmedOrigin = origin ? origin.trim().replace(/(^,)|(,$)/g, "") : "";
  return ALLOWED_ORIGINS.has(trimmedOrigin);
}

const DisableConnectRateLimit = true


async function handleUpgrade(request, socket, head, wss) {
  const ip = request.socket["true-client-ip"] || request.socket["x-forwarded-for"] || request.socket.remoteAddress;

  try {
    if (!DisableConnectRateLimit) await connectionRateLimiter.consume(ip);
    const origin = request.headers["sec-websocket-origin"] || request.headers.origin;

    if (!isValidOrigin(origin)) {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => wss.emit("connection", ws, request));
  } catch {
    socket.write("HTTP/1.1 429 Too Many Requests\r\n\r\n");
    socket.destroy();
  }
}

function setupWebSocketServer(wss, server) {
  wss.on("connection", async (ws, req) => {
    try {
      if (await checkForMaintenance()) {
        ws.send(JSON.stringify({ type: "error", message: "maintenance" }));
        ws.close(4008, "maintenance");
        return;
      }
          
      const [_, token, gamemode] = req.url.split("/");
      const origin = req.headers["sec-websocket-origin"] || req.headers.origin;


      if (!token || !gamemode || !GAME_MODES.has(gamemode) || !isValidOrigin(origin)) {
        ws.close(4004, "Unauthorized");
        return;
      }

      const playerVerified = await verifyPlayer(token);
      if (!playerVerified) {
        ws.close(4001, "Invalid token");
        return;
      }

      const username = playerVerified.playerId;
      const existingServerId = await checkExistingSession(username);

      if (existingServerId) {
        ws.send(JSON.stringify({ type: "error", message: `User "${username}" is already connected.` }));
        ws.close(4006, "code:double");
        return;
      }

      await addSession(username);
      
      const joinResult = await AddPlayerToRoom(ws, gamemode, playerVerified);
      if (!joinResult) {
        await removeSession(username);
        ws.close(4001, "Invalid token or room full");
        return;
      }

      playerCount++

      const room = joinResult.room
      const playerId = joinResult.playerId
      const player = room.players.get(playerId)

      ws.on('error', (error) => {
    // Check for the specific error code
    if (error.code === 'WS_ERR_UNSUPPORTED_MESSAGE_LENGTH') {
      ws.close(1009, 'im damn angry man'); 
    } else {
      ws.close(1009, 'error'); 
    }
  });


      ws.on("message", (message) => handleMessage(room, player, message));
      ws.on("close", async () => {
         playerLookup.delete(username);
        if (player) RemovePlayerFromRoom(room, player);
        await removeSession(username);
          playerCount--
      });
    } catch (error) {
      console.error("Error during WebSocket connection:", error);
      ws.close(1011, "Internal server error");
    }
  });



server.on("upgrade", (request, socket, head) => {

 if (!request.url.length || request.url.length > 300) {
   socket.destroy();
   return;
 } 

  handleUpgrade(request, socket, head, wss);
});
}

module.exports = { setupWebSocketServer };