"use strict";

const cluster = require('cluster');
const os = require('os');
const http = require("http");
const WebSocket = require("ws");
require("dotenv").config();

const { setupHttpServer } = require("./httpHandler");
const { connectToMongoDB } = require("./src/database/mongoClient");
const { RateLimiterMemory } = require("rate-limiter-flexible");
const { ALLOWED_ORIGINS, GAME_MODES, RATE_LIMITS } = require("./config");
const { verifyPlayer } = require("./src/database/verifyPlayer");
const { checkForMaintenance } = require("./src/database/ChangePlayerStats");

// These are now optional (you can keep Redis for sessions or remove it later)
let addSession, removeSession;
try { ({ addSession, removeSession } = require("./src/database/redisClient")); } catch(e) {}

const connectionRateLimiter = new RateLimiterMemory(RATE_LIMITS.CONNECTION);
const PORT = process.env.PORT || 8080;
const numCPUs = os.cpus().length;
const devmode = false;

// ──────────────────────────────────────────────────────────────
// PRIMARY-ONLY: Global matchmaking state (the ONE source of truth)
// ──────────────────────────────────────────────────────────────
const openRoomsByMode = new Map(); // "battle_royale_3" → [{workerId, roomId, playerCount, maxplayers}]
const playerWorkerMap = new Map();  // username → workerId
const readyWorkers = new Set();     // worker.id of ready workers
let workerLoads = Array(numCPUs).fill(0);

// ──────────────────────────────────────────────────────────────
// WORKER CODE
// ──────────────────────────────────────────────────────────────
if (cluster.isWorker) {
  console.log(`Worker ${cluster.worker.id} (PID: ${process.pid}) starting...`);

  global.playerCount = 0;
  const { playerLookup, GetRoom } = require("./src/room/room");
  const { handleMessage } = require("./src/packets/HandleMessage");

  // Tell primary we're alive
  process.send({ cmd: "worker-ready" });

  // Report room changes to primary
  function reportRoom(room, action = "update") {
    process.send({
      cmd: "room-index-update",
      action,
      gamemode: room.gamemode,
      sp_level: room.sp_level,
      roomId: room.roomId,
      playerCount: room.players.size,
      maxplayers: room.maxplayers
    });
  }

  // Hook into your existing Room class (you already have addRoomToIndex/removeRoomFromIndex)
  const originalAdd = require("./src/room/room").addRoomToIndex;
  const originalRemove = require("./src/room/room").removeRoomFromIndex;

  require("./src/room/room").addRoomToIndex = function(room) {
    originalAdd(room);
    if (room.players.size < room.maxplayers) reportRoom(room, "add");
  };

  require("./src/room/room").removeRoomFromIndex = function(room) {
    originalRemove(room);
    reportRoom(room, "remove");
  };

  // Also report when player joins/leaves (fallback)
  const origAddPlayer = require("./src/room/room").Room.prototype.addPlayer;
  require("./src/room/room").Room.prototype.addPlayer = async function(...args) {
    const result = await origAddPlayer.call(this, ...args);
    if (result && this.players.size < this.maxplayers) {
      reportRoom(this, "add");
    } else if (result) {
      reportRoom(this, "remove");
    }
    return result;
  };

  process.on("message", async (msg, socket) => {
    if (msg.cmd !== "new-connection") return;

    const { playerData, head, request } = msg;
    const { ws } = await new Promise(resolve => {
      const fakeWs = new WebSocket(null);
      fakeWs._socket = socket;
      const wss = new WebSocket.Server({ noServer: true });
      wss.handleUpgrade(request, socket, head, ws => resolve({ ws }));
    });

    try {
      const joinResult = await GetRoom(ws, playerData.gamemode, playerData.playerVerified);
      if (!joinResult) {
        ws.close(4001, "Room full or error");
        process.send({ cmd: "player-left", username: playerData.username });
        return;
      }

      global.playerCount++;
      const room = joinResult.room;
      const player = room.players.get(joinResult.playerId);

      playerLookup.set(playerData.username, { ws, player, room });

      ws.on("message", data => handleMessage(room, player, data));
      ws.on("close", () => {
        global.playerCount--;
        playerLookup.delete(playerData.username);
        player?.room?.removePlayer(player);
        process.send({ cmd: "player-left", username: playerData.username });
      });

    } catch (err) {
      console.error("Worker connection error:", err);
      ws.close(1011);
    }
  });
}

// ──────────────────────────────────────────────────────────────
// PRIMARY CODE (Matchmaker + Router)
// ──────────────────────────────────────────────────────────────
else {
  console.log(`Primary ${process.pid} running on ${numCPUs} CPUs`);

  // Kill old workers
  for (const w of Object.values(cluster.workers ?? {})) w?.kill();
  setTimeout(() => {
    for (let i = 0; i < numCPUs; i++) cluster.fork();
  }, 250);

  cluster.on("fork", w => console.log(`Forked worker ${w.process.pid}`));
  cluster.on("exit", () => cluster.fork());

  cluster.on("message", (worker, msg) => {
    if (msg.cmd === "worker-ready") readyWorkers.add(worker.id);
    if (msg.cmd === "player-left") playerWorkerMap.delete(msg.username);

    if (msg.cmd === "room-index-update") {
      const key = `${msg.gamemode}_${msg.sp_level}`;
      if (!openRoomsByMode.has(key)) openRoomsByMode.set(key, []);

      const list = openRoomsByMode.get(key);
      const existing = list.find(r => r.roomId === msg.roomId);

      if (msg.action === "remove" || msg.playerCount >= msg.maxplayers) {
        if (existing) list.splice(list.indexOf(existing), 1);
      } else if (msg.action === "add" || msg.action === "update") {
        if (existing) {
          existing.playerCount = msg.playerCount;
        } else {
          list.push({
            workerId: worker.id,
            roomId: msg.roomId,
            playerCount: msg.playerCount,
            maxplayers: msg.maxplayers
          });
        }
      }
    }
  });

  // ONE HTTP + WS server in primary
  const server = http.createServer(setupHttpServer);
  const wss = new WebSocket.Server({ noServer: true });

  function isValidOrigin(origin) {
    const o = origin?.trim().replace(/(^,)|(,$)/g, "");
    return ALLOWED_ORIGINS.has(o);
  }

  server.on("upgrade", async (request, socket, head) => {
    if (!request.url || request.url.length > 300) return socket.destroy();

    const ip = request.headers["x-forwarded-for"]?.split(',')[0] || request.socket.remoteAddress;
    try {
      if (RATE_LIMITS.CONNECTION) await connectionRateLimiter.consume(ip);
      const origin = request.headers.origin || request.headers["sec-websocket-origin"];
      if (!isValidOrigin(origin)) throw new Error("Invalid origin");

      const [, token, gamemode] = request.url.split("/");
      if (!token || !gamemode || !GAME_MODES.has(gamemode)) throw new Error("Bad request");

      if (await checkForMaintenance()) throw new Error("Maintenance");

      const playerVerified = await verifyPlayer(token);
      if (!playerVerified) throw new Error("Invalid token");

      const username = playerVerified.playerId;
      const spLevel = require("./src/room/room").matchmakingsp?.(playerVerified.skillpoints || 0) || 0;
      const key = `${gamemode}_${spLevel}`;

      // Kick duplicate login
      if (playerWorkerMap.has(username)) {
        const oldWorker = cluster.workers[playerWorkerMap.get(username)];
        oldWorker?.send({ cmd: "disconnect-player", username });
      }

      // MATCHMAKING: Find open room first
      let targetWorker = null;
      if (openRoomsByMode.has(key)) {
        const openRoom = openRoomsByMode.get(key).find(r => r.playerCount < r.maxplayers);
        if (openRoom) {
          targetWorker = cluster.workers[openRoom.workerId];
          // optimistic increment
          openRoom.playerCount++;
        }
      }

      // No open room → pick least loaded ready worker
      if (!targetWorker && readyWorkers.size > 0) {
        const bestId = [...readyWorkers].sort((a,b) => workerLoads[a-1] - workerLoads[b-1])[0];
        targetWorker = cluster.workers[bestId];
        workerLoads[bestId - 1]++;
      }

      if (!targetWorker) throw new Error("No workers available");

      playerWorkerMap.set(username, targetWorker.id);

      // Forward TCP socket + all data to correct worker
      targetWorker.send({
        cmd: "new-connection",
        playerData: { token, gamemode, playerVerified, username },
        request,
        head
      }, socket);

    } catch (err) {
      socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
      socket.destroy();
    }
  });

  server.listen(PORT, () => {
    console.log(`Game server running on port ${PORT} | ${numCPUs} workers | Matchmaking active`);
  });

  process.on("SIGINT", () => {
    console.log("Shutting down...");
    for (const w of Object.values(cluster.workers)) w.kill();
    server.close(() => process.exit(0));
  });
}
