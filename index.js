const cluster = require("cluster");
const os = require("os");
const http = require("http");
const WebSocket = require("ws");

require("dotenv").config();

const { setupHttpServer } = require("./httpHandler");
const { setupWebSocketServer } = require("./websocketHandler");
const { connectToMongoDB } = require("./src/database/mongoClient");
const { startHeartbeat } = require("./src/database/redisClient");

const PORT = process.env.PORT || 8080;
const numCPUs = os.cpus().length;
const DisableClustering = true

// ----------------------------------------
// WORKER SETUP
// ----------------------------------------
async function startWorkerProcess(workerId) {
  try {
    console.log(`Worker ${workerId} (PID: ${process.pid}) starting...`);

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

    server.listen(PORT, () => {
      console.log(`Worker ${workerId} now listening on port ${PORT}`);
    });
  } catch (err) {
    console.error(`Worker ${workerId} failed to start:`, err);
    process.exit(1);
  }
}

// ----------------------------------------
// SHUTDOWN HANDLERS
// ----------------------------------------
process.on("SIGINT", () => {
  console.log(`Process ${process.pid} shutting down...`);
  process.exit(0);
});

process.on("uncaughtException", (err) => {
  console.error(`Uncaught exception in PID ${process.pid}`, err);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error(`Unhandled rejection in PID ${process.pid}`, reason);
  process.exit(1);
});

// ----------------------------------------
// MASTER LOGIC
// ----------------------------------------
if (cluster.isPrimary) {

  if (DisableClustering) return

  console.log(`Master ${process.pid} running with ${numCPUs} CPUs.`);

  // ----------------------------------------
  // 🔥 HOT RELOAD CLEANUP (IMPORTANT)
  // Kill any workers left over from previous runs.
  // ----------------------------------------
  for (const worker of Object.values(cluster.workers ?? {})) {
    worker?.kill();
  }

  // Give them a moment to die before forking new ones
  setTimeout(() => {
    console.log("Starting fresh workers...");

    for (let i = 0; i < numCPUs; i++) {
      cluster.fork();
    }
  }, 250);

  cluster.on("exit", (worker, code, signal) => {
    console.warn(
      `Worker ${worker.process.pid} exited (code ${code}, signal ${signal}) – respawning.`
    );
    cluster.fork();
  });

  cluster.on("fork", (worker) => {
    console.log(`Forked worker ${worker.process.pid}`);
  });

  // ----------------------------------------
  // WORKER LOGIC
  // ----------------------------------------
} else {
  startWorkerProcess(cluster.worker.id);

  cluster.worker.on("online", () => {
    console.log(`Worker ${process.pid} is online.`);
  });
}
