// src/handlers/webSocketHandler.js
const { RateLimiterMemory } = require("rate-limiter-flexible");
const { ALLOWED_ORIGINS, GAME_MODES, RATE_LIMITS, SERVER_INSTANCE_ID } = require("@main/config");
const { verifyPlayer } = require("./src/database/verifyPlayer");
const { checkForMaintenance } = require("./src/database/ChangePlayerStats");
const { addSession, removeSession, checkExistingSession, redisClient } = require("./src/database/redisClient");
const { handleMessage } = require("./src/packets/HandleMessage");
const { playerLookup, GetRoom } = require("./src/room/room");

const connectionRateLimiter = new RateLimiterMemory(RATE_LIMITS.CONNECTION);

function isValidOrigin(origin) {
  const trimmedOrigin = origin ? origin.trim().replace(/(^,)|(,$)/g, "") : "";
  return ALLOWED_ORIGINS.has(trimmedOrigin);
}

const DisableConnectRateLimit = true

const devmode = false



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
        ws.send("gamemode_not_allowed")
        ws.close(4004, "Unauthorized");
        return;
        
      }

      

      const playerVerified = await verifyPlayer(token);
      if (!playerVerified) {
        ws.close(4001, "Invalid token");
        return;
      }

      const username = playerVerified.playerId;

      let existingSid;

if (playerLookup.has(username)) {
  existingSid = SERVER_INSTANCE_ID; // Local session exists
} else {
  // Check Redis for existing session
  existingSid = await checkExistingSession(username);
}

  if (existingSid) {
    if (existingSid === SERVER_INSTANCE_ID) {
      // Existing session is on THIS server → kick local connection
      const existingConnection = playerLookup.get(username);
      if (existingConnection) {
        existingConnection.send("code:double");
        existingConnection.wsClose(1001, "Reassigned connection");
      //  await new Promise((resolve) => existingConnection.once("close", resolve));
          playerLookup.delete(username);
      }
    } else {
      // Existing session is on ANOTHER server → publish an invalidation event
      await redisClient.publish(
        `server:${existingSid}`,
        JSON.stringify({ type: "disconnect", uid: username })
      );
    }
  }


     if (!devmode) await addSession(username);

     
      
      const joinResult = await GetRoom(ws, gamemode, playerVerified);
      if (!joinResult) {
        await removeSession(username);
        ws.close(4001, "Invalid token or room full");
        console.log("s")
      
        return;
      }


      
   

     global.playerCount++

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
        if (player) player.room.removePlayer(player);
       if (!devmode) await removeSession(username);
        global.playerCount--
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