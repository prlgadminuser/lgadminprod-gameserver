// server.js
"use strict";

require("dotenv").config();
require("module-alias/register");


const http = require("http");
const WebSocket = require("ws");
const { setupHttpServer } = require("./httpHandler");
const { setupWebSocketServer } = require("./websocketHandler");
const { connectToMongoDB } = require("./src/database/mongoClient");
const { startHeartbeat } = require("./src/database/redisClient");

async function startServer() {
  try {
    // Connect to databases
    await connectToMongoDB();
    startHeartbeat();

    // Setup servers
    const server = http.createServer(setupHttpServer);
    const wss = new WebSocket.Server({
      noServer: true,
      clientTracking: false,
      perMessageDeflate: false,
      maxPayload: 10, // 10MB max payload (adjust according to your needs)
    });

    setupWebSocketServer(wss, server);

    const PORT = process.env.PORT || 8080;
    server.listen(PORT, () => {
      console.log(`Skilldown GameServer is listening on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("Server shutting down...");
  // Graceful shutdown logic here (e.g., closing Redis/Mongo connections)
  process.exit(0);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
  process.exit(1);
});

startServer();
