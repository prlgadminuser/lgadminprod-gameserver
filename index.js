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

let addSession, removeSession;
try { ({ addSession, removeSession } = require("./src/database/redisClient")); } catch(e) {}

const connectionRateLimiter = new RateLimiterMemory(RATE_LIMITS.CONNECTION);
const PORT = process.env.PORT || 8090;
const numCPUs = os.cpus().length;

// ──────────────────────────────────────────────────────────────
// PRIMARY-ONLY: Global matchmaking state
// ──────────────────────────────────────────────────────────────
const openRoomsByMode = new Map();
const playerWorkerMap = new Map();
const readyWorkers = new Set();
let workerLoads = Array(numCPUs).fill(0);

// ──────────────────────────────────────────────────────────────
// WORKER CODE
// ──────────────────────────────────────────────────────────────
if (cluster.isWorker) {
    console.log(`Worker ${cluster.worker.id} (PID: ${process.pid}) starting...`);

    global.playerCount = 0;

    const { playerLookup, GetRoom, Room } = require("./src/room/room");
    const { addRoomToIndex: origAdd, removeRoomFromIndex: origRemove } = require("./src/room/room");
    const { handleMessage } = require("./src/packets/HandleMessage");

    process.send({ cmd: "worker-ready" });

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

    require("./src/room/room").addRoomToIndex = function(room) {
    origAdd(room);
    reportRoom(room, "add"); // ← This tells primary: "I have an open room!"
};

// Hook room removal
require("./src/room/room").removeRoomFromIndex = function(room) {
    origRemove(room);
    process.send({
        cmd: "room-index-update",
        action: "remove",
        gamemode: room.gamemode,
        sp_level: room.sp_level,
        roomId: room.roomId
    });
};

const roomModule = require("./src/room/room");

const OriginalAddPlayer = roomModule.Room.prototype.addPlayer;

// Now override it safely
roomModule.Room.prototype.addPlayer = async function(...args) {
    const result = await OriginalAddPlayer.call(this, ...args);
    if (result) {
        const isOpen = this.players.size < this.maxplayers;
        reportRoom(this, isOpen ? "add" : "remove");
    }
    return result;
};

    // Handle socket forwarded from primary
    process.on("message", async (msg, socket) => {
        if (msg.cmd !== "new-connection") return;

        const { playerData, headers, url, method, head } = msg;
        const wss = new WebSocket.Server({ noServer: true });

        wss.handleUpgrade({ headers, url, method }, socket, head, (ws) => {
            handleIncomingConnection(ws, playerData);
        });
    });

    async function handleIncomingConnection(ws, playerData) {
        try {
            const joinResult = await GetRoom(ws, playerData.gamemode, playerData.playerVerified);
            if (!joinResult) {
                ws.close(4001, "Room full");
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
    }
}

// ──────────────────────────────────────────────────────────────
// PRIMARY CODE
// ──────────────────────────────────────────────────────────────
else {
    console.log(`Primary ${process.pid} running on ${numCPUs} CPUs`);

    for (const w of Object.values(cluster.workers ?? {})) w?.kill();
    setTimeout(() => {
        for (let i = 0; i < numCPUs; i++) cluster.fork();
    }, 250);

    cluster.on("fork", w => console.log(`Forked worker ${w.process.pid}`));
    cluster.on("exit", () => cluster.fork());

    cluster.on("message", (worker, msg) => {
        if (msg.cmd === "worker-ready") readyWorkers.add(worker.id);
        if (msg.cmd === "player-left") {
            playerWorkerMap.delete(msg.username);
            workerLoads[worker.id - 1] = Math.max(0, workerLoads[worker.id - 1] - 1);
        }

        if (msg.cmd === "room-index-update") {
            const key = `${msg.gamemode}_${msg.sp_level}`;
            if (!openRoomsByMode.has(key)) openRoomsByMode.set(key, []);

            const list = openRoomsByMode.get(key);
            const existing = list.find(r => r.roomId === msg.roomId);

            if (msg.action === "remove" || msg.playerCount >= msg.maxplayers) {
                if (existing) list.splice(list.indexOf(existing), 1);
            } else if (msg.action === "add" || msg.action === "update") {
                if (existing) existing.playerCount = msg.playerCount;
                else list.push({
                    workerId: worker.id,
                    roomId: msg.roomId,
                    playerCount: msg.playerCount,
                    maxplayers: msg.maxplayers
                });
            }
        }
    });

    const server = http.createServer(setupHttpServer);

    function isValidOrigin(origin) {
        const o = origin?.trim().replace(/(^,)|(,$)/g, "");
        return ALLOWED_ORIGINS.has(o);
    }

    server.on("upgrade", async (request, socket, head) => {
        const ip = request.headers["x-forwarded-for"]?.split(',')[0] || request.socket.remoteAddress;

        try {
          //  if (RATE_LIMITS.CONNECTION) await connectionRateLimiter.consume(ip);
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

            // Disconnect duplicate login
            if (playerWorkerMap.has(username)) {
                const oldWorker = cluster.workers[playerWorkerMap.get(username)];
                oldWorker?.send({ cmd: "disconnect-player", username });
            }

            // Matchmaking: open room first
            let targetWorker = null;
            if (openRoomsByMode.has(key)) {
                const openRoom = openRoomsByMode.get(key).find(r => r.playerCount < r.maxplayers);
                if (openRoom) {
                    targetWorker = cluster.workers[openRoom.workerId];
                    openRoom.playerCount++;
                }
            }

            // Pick least-loaded worker
            if (!targetWorker && readyWorkers.size > 0) {
                const bestId = [...readyWorkers].sort((a, b) => workerLoads[a - 1] - workerLoads[b - 1])[0];
                targetWorker = cluster.workers[bestId];
                workerLoads[bestId - 1]++;
            }

            if (!targetWorker) throw new Error("No workers available");

            playerWorkerMap.set(username, targetWorker.id);

            targetWorker.send({
                cmd: "new-connection",
                playerData: { token, gamemode, playerVerified, username },
                headers: request.headers,
                url: request.url,
                method: request.method,
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
