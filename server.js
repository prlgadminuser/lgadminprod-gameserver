"use strict";
require("dotenv").config();

const cluster = require("cluster");
const os = require("os");
const http = require("http");
const WebSocket = require("ws");

const { ALLOWED_ORIGINS, GAME_MODES } = require("./config");
const { setupHttpServer } = require("./httpHandler");
const { verifyPlayer } = require("./src/database/verifyPlayer");
const { checkForMaintenance } = require("./src/database/ChangePlayerStats");
const { removeSession, startHeartbeat } = require("./src/database/redisClient");
const { handleMessage } = require("./src/packets/HandleMessage");
const { playerLookup, GetRoom } = require("./src/room/room");
const { connectToMongoDB } = require("./src/database/mongoClient");

const isValidOrigin = (origin) => {
    let o = origin ? origin.trim().replace(/(^,)|(,$)/g, "") : "";
    return ALLOWED_ORIGINS.has(o);
};

// Handle WebSocket upgrade
async function handleUpgrade(req, socket, head, wss) {
    try {
        const origin = req.headers["sec-websocket-origin"] || req.headers.origin;
        if (!isValidOrigin(origin)) {
            socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
            socket.destroy();
            return;
        }
        wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
    } catch {
        socket.write("HTTP/1.1 429 Too Many Requests\r\n\r\n");
        socket.destroy();
    }
}

function setupWebSocketServer(wss, server) {
    const wsMap = new Map();

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
                ws.send("gamemode_not_allowed");
                ws.close(4004, "Unauthorized");
                return;
            }

            const player = await verifyPlayer(token);
            if (!player) {
                ws.close(4001, "Invalid token");
                return;
            }

            const playerId = player.playerId;
            wsMap.set(playerId, ws);

            // Directly join a room in the worker
            const joinResult = await GetRoom(ws, gamemode, player);
            const room = joinResult.room;
            const roomPlayer = room.players.get(playerId);



            // Attach message handler only after room assignment
           
            ws.on("message", (msg) => handleMessage(room, roomPlayer, msg));

            ws.on("error", (err) => {
                ws.close(1009, err.code === "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH" ? "Unsupported message length" : "error");
            });

            ws.on("close", async () => {
                wsMap.delete(playerId);
                await removeSession(playerId);
                if (playerLookup.has(playerId)) {
                    playerLookup.get(playerId).room.removePlayer(playerLookup.get(playerId));
                }
            });
        } catch (err) {
            console.error("WebSocket connection error:", err);
            ws.close(1011, "Internal server error");
        }
    });

    server.on("upgrade", (req, socket, head) => handleUpgrade(req, socket, head, wss));
}

async function startWorker() {
    try {
        await connectToMongoDB();
        //startHeartbeat();

        const server = http.createServer(setupHttpServer);
        const wss = new WebSocket.Server({
            noServer: true,
            clientTracking: false,
            perMessageDeflate: false,
            maxPayload: 10
        });

        setupWebSocketServer(wss, server);

        const port = process.env.PORT || 8080;
        server.listen(port, () => {
            console.log(`Worker ${process.pid} listening on port ${port}`);
        });
    } catch (err) {
        console.error("Failed to start worker:", err);
        process.exit(1);
    }
}

// ---------------- Cluster logic ----------------
if (cluster.isPrimary) {
    console.log(`Primary ${process.pid} running`);
    const numWorkers = os.cpus().length;
    for (let i = 0; i < numWorkers; i++) cluster.fork();
} else {
    startWorker();
}

// ---------------- Error Handling ----------------
process.on("SIGINT", () => {
    console.log(`Worker ${process.pid} shutting down...`);
    process.exit(0);
});

process.on("uncaughtException", (err) => {
    console.error("Uncaught Exception:", err);
    process.exit(1);
});

process.on("unhandledRejection", (err) => {
    console.error("Unhandled Rejection:", err);
    process.exit(1);
});
