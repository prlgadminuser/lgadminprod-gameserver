"use strict";

const cluster = require('cluster');
const os = require('os');
const http = require("http");
const WebSocket = require("ws");

// Load environment variables immediately in the master process
require("dotenv").config();

// --- Application Specific Imports (Needed by the Worker) ---
// Note: Adjusted path for setupWebSocketServer based on common Node.js project structure
const { setupHttpServer } = require("./httpHandler");
const { setupWebSocketServer } = require("./websocketHandler"); 
const { connectToMongoDB } = require("./src/database/mongoClient");
const { startHeartbeat } = require("./src/database/redisClient");

// --- Configuration ---
const PORT = process.env.PORT || 8080;
const numCPUs = os.cpus().length;
/**
 * Initializes and starts the HTTP and WebSocket servers for a worker process.
 * This function contains the database connection and server setup logic.
 * @param {number} workerId - The ID of the current cluster worker.
 */
async function startWorkerProcess(workerId) {
    try {
        console.log(`Worker ${workerId} (PID: ${process.pid}) is connecting to databases...`);

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
            maxPayload: 10 * 1024 * 1024, // 10MB max payload
        });

        // Setup the WebSocket handler logic
        setupWebSocketServer(wss, server);

        server.listen(PORT, () => {
            console.log(`Skilldown GameServer Worker ${workerId} is listening on port ${PORT}`);
        });

    } catch (error) {
        console.error(`Worker ${workerId} failed to start:`, error);
        // Exiting causes the master process to fork a new replacement worker
        process.exit(1); 
    }
}

// --- Graceful Shutdown Handlers (applies to both master and workers) ---

// Master/Worker shutdown handler
process.on("SIGINT", async () => {
    console.log(`Process ${process.pid} shutting down...`);
    // Full shutdown logic here
    process.exit(0);
});

process.on("uncaughtException", (error) => {
    console.error(`Process ${process.pid} Uncaught Exception:`, error);
    process.exit(1);
});

process.on("unhandledRejection", (reason) => {
    console.error(`Process ${process.pid} Unhandled Rejection:`, reason);
    process.exit(1);
});

// --- CLUSTER LOGIC (Master/Primary Entry Point) ---
if (cluster.isPrimary) {
    console.log(`Master process ${process.pid} is running. Total CPUs: ${numCPUs}`);
    

    // Fork workers based on CPU count
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }

    // Handle worker death and auto-restart
    cluster.on('exit', (worker, code, signal) => {
        console.error(`Worker ${worker.process.pid} died (Code: ${code}, Signal: ${signal}). Restarting...`);
        // Fork a new worker to replace the dead one
        cluster.fork();
    });

    cluster.on('fork', (worker) => {
        console.log(`Forking new worker: ${worker.process.pid}`);
    });

} else {
    // Worker Process Logic
    // Every forked worker runs this part.
    startWorkerProcess(cluster.worker.id);

    cluster.worker.on('online', () => {
        console.log(`Worker ${process.pid} has connected.`);
    });
}