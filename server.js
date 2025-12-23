"use strict";

require("dotenv").config();
const cluster = require("cluster");
const os = require("os");
const http = require("http");
const WebSocket = require("ws");
const { RateLimiterMemory } = require("rate-limiter-flexible");
const { v4: uuidv4 } = require("uuid"); // Add uuid if not already installed

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

const { handleMessage } = require("./src/packets/HandleMessage");
const { GetRoom, rooms, playerLookup } = require("./src/room/room"); // Note: GetRoom will be modified or replaced
const { connectToMongoDB } = require("./src/database/mongoClient");

const CPU_COUNT = os.cpus().length;
const CONNECTION_RATE_LIMIT_ENABLED = false;
const DEV_MODE = false;

// ===== MASTER PROCESS =====
if (cluster.isPrimary) {
  console.log(`[MASTER] PID ${process.pid} starting`);

  const roomRegistry = new Map(); // roomId → { workerId, gamemode, maxPlayers, players }

  // Handle messages from workers
  cluster.on("message", (worker, msg) => {
    try {
      switch (msg.type) {
        case "ROOM_CREATED": {
          roomRegistry.set(msg.roomId, {
            workerId: worker.id,
            gamemode: msg.gamemode,
            maxPlayers: msg.maxPlayers,
            players: msg.players || 1,
          });
          break;
        }
        case "ROOM_UPDATE": {
          const r = roomRegistry.get(msg.roomId);
          if (r) r.players = msg.players;
          break;
        }
        case "ROOM_CLOSED": {
          roomRegistry.delete(msg.roomId);
          break;
        }
        case "QUERY_ROOMS": {
          // Respond to worker asking for available rooms
          const available = [];
          for (const [roomId, info] of roomRegistry) {
            if (
              info.gamemode === msg.gamemode &&
              info.players < info.maxPlayers
            ) {
              available.push({
                roomId,
                players: info.players,
                maxPlayers: info.maxPlayers,
                workerId: info.workerId,
              });
            }
          }
          // Sort by most filled first (better filling)
          available.sort((a, b) => b.players - a.players);

          worker.send({
            type: "QUERY_ROOMS_RESPONSE",
            requestId: msg.requestId,
            rooms: available,
          });
          break;
        }
      }
    } catch (err) {
      console.error(`[MASTER] Error processing message:`, err);
    }
  });

  for (let i = 0; i < CPU_COUNT; i++) cluster.fork();

  cluster.on("exit", (worker) => {
    console.warn(`[MASTER] Worker ${worker.process.pid} died`);
    // Clean up rooms owned by dead worker
    for (const [roomId, info] of roomRegistry.entries()) {
      if (info.workerId === worker.id) {
        roomRegistry.delete(roomId);
      }
    }
    cluster.fork();
  });

  return;
}

// ===== WORKER PROCESS =====
const connectionRateLimiter = new RateLimiterMemory(RATE_LIMITS.CONNECTION);

function isValidOrigin(origin) {
  const trimmed = origin?.trim().replace(/(^,)|(,$)/g, "") ?? "";
  return ALLOWED_ORIGINS.has(trimmed);
}

async function handleUpgrade(request, socket, head, wss) {
  try {
    const ip =
      request.socket["true-client-ip"] ||
      request.socket["x-forwarded-for"] ||
      request.socket.remoteAddress;

    if (CONNECTION_RATE_LIMIT_ENABLED) await connectionRateLimiter.consume(ip);

    const origin =
      request.headers["sec-websocket-origin"] || request.headers.origin;
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

// Helper: Ask master for available rooms
function queryAvailableRooms(gamemode) {
  return new Promise((resolve) => {
    const requestId = uuidv4();
    const listener = (msg) => {
      if (msg.type === "QUERY_ROOMS_RESPONSE" && msg.requestId === requestId) {
        process.removeListener("message", listener);
        resolve(msg.rooms);
      }
    };
    process.on("message", listener);

    process.send({
      type: "QUERY_ROOMS",
      gamemode,
      requestId,
    });

    // Timeout fallback
    setTimeout(() => {
      process.removeListener("message", listener);
      resolve([]);
    }, 2000);
  });
}

// ===== WEBSOCKET SERVER =====
function setupWebSocketServer(wss, server) {
  wss.on("connection", async (ws, req) => {
    let player = null;
    let room = null;
    let username = null;

    try {
      ws.on("error", (err) => console.error("WebSocket error:", err));

      if (await checkForMaintenance()) {
        ws.close(4008, "maintenance");
        return;
      }

      // Parse URL: /token/gamemode?targetRoom=optionalRoomId
      const urlParts = req.url.split("/");
      const queryIndex = urlParts[2]?.indexOf("?");
      const gamemode = queryIndex > -1 ? urlParts[2].slice(0, queryIndex) : urlParts[2];
      const searchParams = new URLSearchParams(queryIndex > -1 ? urlParts[2].slice(queryIndex + 1) : "");
      const targetRoom = searchParams.get("targetRoom");
      const token = urlParts[1];

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

      username = playerVerified.playerId;

      // Kick existing session
      const existingSid = playerLookup.has(username)
        ? SERVER_INSTANCE_ID
        : await checkExistingSession(username);

      if (existingSid) {
        if (existingSid === SERVER_INSTANCE_ID) {
          const existing = playerLookup.get(username);
          existing?.wsClose(1001, "Reassigned");
        } else {
          await redisClient.publish(
            `server:${existingSid}`,
            JSON.stringify({ type: "disconnect", uid: username })
          );
        }
      }

      if (!DEV_MODE) await addSession(username);

      // === GLOBAL MATCHMAKING LOGIC ===
      let joinedRoom = null;

      if (targetRoom) {
        // Client was redirected to join specific room (on this worker)
        joinedRoom = rooms.get(targetRoom);
        if (joinedRoom && joinedRoom.players.size < joinedRoom.maxplayers) {
          room = joinedRoom;
        }
      }

      if (!room) {
        // Query master for best available room across all workers
        const availableRooms = await queryAvailableRooms(gamemode);

        if (availableRooms.length > 0) {
          const bestRoom = availableRooms[0]; // Most filled

          if (bestRoom.workerId === cluster.worker.id) {
            // Room is on this worker → join locally
            room = rooms.get(bestRoom.roomId);
          } else {
            // Room is on another worker → redirect client
            const redirectUrl = `${req.url.split("?")[0]}?targetRoom=${bestRoom.roomId}`;
            ws.close(1012, `redirect:${redirectUrl}`);
            if (!DEV_MODE) await removeSession(username);
            return;
          }
        }
      }

      // If no suitable room found anywhere, create new one
      if (!room) {
        room = await GetRoom(ws, gamemode, playerVerified); // This should create a new room
        if (!room) {
          ws.close(1011, "Failed to create room");
          return;
        }

        // Notify master of new room
        process.send({
          type: "ROOM_CREATED",
          roomId: room.roomId,
          gamemode: room.gamemode,
          maxPlayers: room.maxplayers,
          players: 1,
        });
      } else {
        // Join existing local room
        // Assuming GetRoom or room.joinPlayer exists — adapt to your room implementation
        const success = room.addPlayer(ws, playerVerified); // You may need to adjust this
        if (!success) {
          ws.close(1011, "Room full");
          return;
        }
      }

      // Final setup
      player = playerLookup.get(username);
      if (player) player.room = room;

      console.log(`Player ${username} joined room ${room.roomId} (${room.players.size}/${room.maxplayers})`);

      ws.on("close", async () => {
        if (!player) return;
        player.room?.removePlayer(player);
        playerLookup.delete(username);
        if (!DEV_MODE) await removeSession(username);

        const currentCount = player.room?.players.size || 0;
        process.send({
          type: "ROOM_UPDATE",
          roomId: player.room?.roomId,
          players: currentCount,
        });

        if (currentCount === 0 && player.room) {
          rooms.delete(player.room.roomId);
          process.send({
            type: "ROOM_CLOSED",
            roomId: player.room.roomId,
          });
        }
      });

      ws.on("message", (msg) => {
        if (player && player.room) {
          handleMessage(player.room, player, msg);
        }
      });
    } catch (err) {
      console.error("WS connection error:", err);
      try { ws.close(1011); } catch {}
      if (username && !DEV_MODE) await removeSession(username);
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

// ===== START SERVER =====
async function startServer() {
  await connectToMongoDB();
  startHeartbeat();

  const server = http.createServer(setupHttpServer);
  const wss = new WebSocket.Server({ noServer: true });

  setupWebSocketServer(wss, server);

  const PORT = process.env.PORT || 8080;
  server.listen(PORT, () =>
    console.log(`[WORKER ${process.pid}] listening on ${PORT}`)
  );
}

startServer();