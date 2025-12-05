"use strict";

const cluster = require('cluster');
const os = require('os');
const http = require("http");
const WebSocket = require("ws");

// Load environment variables immediately in the master process
require("dotenv").config();


// --- Application Specific Imports ---
const { setupHttpServer } = require("./httpHandler");
const { setupWebSocketServer } = require("./websocketHandler"); 
const { connectToMongoDB } = require("./src/database/mongoClient");
const { startHeartbeat } = require("./src/database/redisClient");
// This is used to signal which process is the matchmaker.
const WORKER_TYPE = {
    MATCHMAKER: 'matchmaker',
    GAME_SERVER: 'game_server'
};

// --- Configuration ---
const PORT = process.env.PORT || 8080;
const totalCPUs = os.cpus().length;
const matchmakerCount = 1;
// Subtract one for the dedicated matchmaker
const gameWorkerCount = Math.max(0, totalCPUs - matchmakerCount); 

/**
 * Initializes and starts the HTTP and WebSocket servers for a worker process.
 * The behavior changes based on the worker type assigned by the master.
 * @param {number} workerId - The ID of the current cluster worker.
 * @param {string} type - 'matchmaker' or 'game_server'
 */
async function startWorkerProcess(workerId, type) {
    try {
        console.log(`[${type.toUpperCase()}] Worker ${workerId} (PID: ${process.pid}) starting up...`);

        // Connect to databases (done once per worker)
        await connectToMongoDB();
        startHeartbeat(); // Redis heartbeat for this worker

        // Setup servers
        const server = http.createServer(setupHttpServer);
        
        // Each worker creates its own WSS instance listening on the shared port
        const wss = new WebSocket.Server({
            noServer: true,
            clientTracking: false,
            perMessageDeflate: false,
            maxPayload: 50,
        });

        // The setupWebSocketServer must now contain logic to check if it's the matchmaker
        // or a game server. The matchmaking part (playerLookup, GetRoom) should only run
        // if type === WORKER_TYPE.MATCHMAKER.
        setupWebSocketServer(wss, server, type); 

        server.listen(PORT, () => {
            console.log(`[${type.toUpperCase()}] Worker ${workerId} is listening on port ${PORT}`);
        });

        // Set up IPC listener in the game workers (to receive player assignment from matchmaker)
        if (type === WORKER_TYPE.GAME_SERVER) {
            process.on('message', (message) => {
                if (message.type === 'assign_player') {
                    // TODO: Handle the assigned player connection here, e.g., using 
                    // process.send(message.socketHandle) to transfer the socket.
                    // This requires a significant change to Node's cluster/IPC logic
                    // which is complex. For now, we focus on separation.
                    console.log(`[GAME_SERVER ${workerId}] Received assignment for player: ${message.username}`);
                }
            });
        }

    } catch (error) {
        console.error(`Worker ${workerId} failed to start:`, error);
        process.exit(1); 
    }
}

// --- CLUSTER LOGIC (Master/Primary Entry Point) ---
if (cluster.isPrimary) {
    console.log(`Master process ${process.pid} is running. Matchmakers: ${matchmakerCount}, Game Servers: ${gameWorkerCount}`);

    // ... (Cleanup of old workers remains the same)

    // 1. Fork the dedicated Matchmaker Worker
    console.log("Forking Matchmaker Worker...");
    const matchmaker = cluster.fork({ workerType: WORKER_TYPE.MATCHMAKER });
    matchmaker.on('online', () => console.log(`Matchmaker ${matchmaker.process.pid} is online.`));

    // 2. Fork the Game Server Workers
    for (let i = 0; i < gameWorkerCount; i++) {
        const gameWorker = cluster.fork({ workerType: WORKER_TYPE.GAME_SERVER });
        gameWorker.on('online', () => console.log(`Game Worker ${gameWorker.process.pid} is online.`));
    }

    // Handle worker death and auto-restart, preserving worker type
    cluster.on('exit', (worker, code, signal) => {
        const type = worker.process.env.workerType;
        console.error(`[${type.toUpperCase()}] Worker ${worker.process.pid} died (Code: ${code}, Signal: ${signal}). Restarting...`);
        // Fork a new worker of the same type
        cluster.fork({ workerType: type });
    });

} else {
    // Worker Process Logic
    const workerType = process.env.workerType || WORKER_TYPE.GAME_SERVER;
    startWorkerProcess(cluster.worker.id, workerType);
}

module.exports = { setupWebSocketServer };