const cluster = require("cluster");
const os = require("os");
const http = require("http");
const WebSocket = require("ws");
require("dotenv").config();

const { setupHttpServer } = require("./httpHandler");
const { connectToMongoDB } = require("./src/database/mongoClient");
const { startHeartbeat } = require("./src/database/redisClient"); // Optional now

const PORT = process.env.PORT || 8080;
const numCPUs = os.cpus().length;

// Global shared state in primary
const rooms = new Map(); // roomId → workerId
const players = new Map(); // playerId (username) → { workerId, roomId }
let workerLoad = []; // For simple load balancing

// ----------------------------------------
// WORKER CODE
// ----------------------------------------
if (cluster.isWorker) {
  console.log(`Worker ${cluster.worker.id} (PID: ${process.pid}) started`);

  // Each worker has its own isolated game state
  global.playerCount = 0;
  const { playerLookup } = require("./src/room/room"); // Local per worker

  process.on("message", (msg, socket) => {
    if (msg.cmd === "new-connection") {
      // Create a fake WebSocket from the passed TCP socket
      const ws = new WebSocket(null);
      ws._socket = socket;

      // Manually upgrade
      const wss = new WebSocket.Server({ noServer: true });
      wss.handleUpgrade(msg.request, socket, msg.head, (client) => {
        // Replace the fake ws with real one
        Object.setPrototypeOf(client, WebSocket.prototype);
        handleClientConnection(client, msg.playerData);
      });
    }

    if (msg.cmd === "disconnect-player") {
      const conn = playerLookup.get(msg.username);
      if (conn) {
        conn.wsClose?.(1000, "Disconnected by master");
        playerLookup.delete(msg.username);
      }
    }
  });

  function handleClientConnection(ws, { token, gamemode, playerVerified, username }) {
    const { GetRoom } = require("./src/room/room");
    const { handleMessage } = require("./src/packets/HandleMessage");

    // Join room logic (same as before)
    GetRoom(ws, gamemode, playerVerified).then(joinResult => {
      if (!joinResult) {
        ws.close(4001, "Room full or invalid");
        process.send({ cmd: "player-disconnected", username });
        return;
      }

      const { room, playerId } = joinResult;
      const player = room.players.get(playerId);

      global.playerCount++;
      playerLookup.set(username, { ws, player, room });

      ws.on("message", (data) => handleMessage(room, player, data));

      ws.on("close", () => {
        playerLookup.delete(username);
        player?.room?.removePlayer(player);
        global.playerCount--;
        process.send({ cmd: "player-disconnected", username });
      });

      ws.on("error", () => ws.close(1011));
    }).catch(err => {
      console.error("Join error:", err);
      ws.close(1011, "Server error");
    });
  }

  // Tell primary we're ready
  process.send({ cmd: "worker-ready" });
  process.on("disconnect", () => process.exit(0));
}

// ----------------------------------------
// PRIMARY (MATCHMAKER) CODE
// ----------------------------------------
if (cluster.isPrimary) {
  console.log(`Primary ${process.pid} running on ${numCPUs} CPUs`);

  // Initialize worker load tracker
  workerLoad = Array(numCPUs).fill(0);

  // Fork workers
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  // Track ready workers
  const readyWorkers = new Set();

  cluster.on("message", (worker, msg) => {
    if (msg.cmd === "worker-ready") {
      readyWorkers.add(worker.id);
      console.log(`Worker ${worker.id} ready`);
    }
    if (msg.cmd === "player-disconnected") {
      players.delete(msg.username);
    }
  });

  cluster.on("exit", (worker, code, signal) => {
    console.warn(`Worker ${worker.process.pid} died. Restarting...`);
    readyWorkers.delete(worker.id);
    cluster.fork();
  });

  // ----------------------------------------
  // SINGLE HTTP + WS SERVER IN PRIMARY
  // ----------------------------------------
  const server = http.createServer(setupHttpServer);
  const wss = new WebSocket.Server({ noServer: true });

  // Reuse your existing rate limiter, origin check, etc.
  const { RateLimiterMemory } = require("rate-limiter-flexible");
  const { verifyPlayer } = require("./src/database/verifyPlayer");
  const { checkForMaintenance } = require("./src/database/ChangePlayerStats");
  const { isValidOrigin, connectionRateLimiter, ConnectionRateLimit, GAME_MODES } = require("./config");

  async function handleUpgrade(request, socket, head) {
    const ip = request.headers["x-forwarded-for"] || request.socket.remoteAddress;

    try {
      if (ConnectionRateLimit) await connectionRateLimiter.consume(ip);

      const origin = request.headers.origin || request.headers["sec-websocket-origin"];
      if (!isValidOrigin(origin)) throw new Error("Invalid origin");

      // Parse URL: /token/gamemode
      const [, token, gamemode] = request.url.split("/");
      if (!token || !gamemode || !GAME_MODES.has(gamemode)) {
        throw new Error("Invalid request");
      }

      if (await checkForMaintenance()) {
        socket.write("HTTP/1.1 503 Service Unavailable\r\n\r\n");
        socket.destroy();
        return;
      }

      const playerVerified = await verifyPlayer(token);
      if (!playerVerified) throw new Error("Invalid token");

      const username = playerVerified.playerId;

      // Check for duplicate login (optional: kick old one)
      if (players.has(username)) {
        const oldWorker = cluster.workers[players.get(username).workerId];
        oldWorker?.send({ cmd: "disconnect-player", username });
      }

      // Load balancing: pick least loaded ready worker
      let targetWorkerId = [...readyWorkers].sort((a, b) => workerLoad[a - 1] - workerLoad[b - 1])[0];
      if (!targetWorkerId) {
        throw new Error("No workers available");
      }

      const targetWorker = cluster.workers[targetWorkerId];
      workerLoad[targetWorkerId - 1]++;

      // Store routing info
      players.set(username, { workerId: targetWorkerId });

      // Forward the actual TCP socket + data to worker
      targetWorker.send({
        cmd: "new-connection",
        playerData: { token, gamemode, playerVerified, username },
        request: request,
        head: head,
      }, socket);

    } catch (err) {
      console.log("Upgrade rejected:", err.message);
      socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
      socket.destroy();
    }
  }

  server.on("upgrade", (request, socket, head) => {
    if (!request.url || request.url.length > 300) return socket.destroy();
    handleUpgrade(request, socket, head);
  });

  server.listen(PORT, () => {
    console.log(`Game server running on ws://localhost:${PORT}`);
    console.log(`Matchmaking active. ${numCPUs} workers ready.`);
  });

  // Graceful shutdown
  process.on("SIGINT", () => {
    console.log("Shutting down...");
    for (const worker of Object.values(cluster.workers)) {
      worker.kill();
    }
    server.close(() => process.exit(0));
  });
}
