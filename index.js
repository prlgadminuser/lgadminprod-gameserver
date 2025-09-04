// server.js
"use strict";
require("module-alias/register");

const http = require("http");
const WebSocket = require("ws");
const { startHeartbeat } = require("@src/Database/redisClient");
const { connectToMongoDB } = require("@src/Database/mongoClient");
const { setupHttpServer } = require("@main/httpHandler");
const { setupWebSocketServer } = require("@main/websocketHandler");

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

    const PORT = process.env.PORT || 8070;
    server.listen(PORT, () => {
      console.log(`Server is listening on port ${PORT}`);
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
