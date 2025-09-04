// src/database/redisClient.js
const Redis = require("ioredis");
const { rediskey } = require("@main/idbconfig");
const { SERVER_INSTANCE_ID, REDIS_KEYS, HEARTBEAT_TTL_SECONDS, HEARTBEAT_INTERVAL_MS } = require("@main/config");
const { playerLookup } = require("../RoomHandler/setup");

const redisClient = new Redis(rediskey);
const sub = new Redis(rediskey);

redisClient.on("connect", () => console.log("Redis command client connected."));
redisClient.on("error", (err) => console.error("Redis command client error:", err));

sub.subscribe("bans", (err) => {
  if (err) console.error("Failed to subscribe to bans channel:", err);
  else console.log("Subscribed to bans channel.");
});

function kickPlayer(username) {
  const player = playerLookup.get(username);
  if (player && player.ws) {
    player.wsClose(4009, "You have been banned.");
  }
}

sub.on("message", (channel, username) => {
  console.log(`Ban event received for ${username}`);
  kickPlayer(username);
});

function startHeartbeat() {
  const initialDelay = Math.random() * 1000; // Add random initial delay to avoid thundering herd
  setTimeout(() => {
    setInterval(async () => {
      try {
        const heartbeatKey = `${REDIS_KEYS.SERVER_HEARTBEAT_PREFIX}${SERVER_INSTANCE_ID}`;
        await redisClient.setex(heartbeatKey, HEARTBEAT_TTL_SECONDS, Date.now().toString());
      } catch (error) {
        console.error("Error sending heartbeat to Redis:", error);
      }
    }, HEARTBEAT_INTERVAL_MS);
  }, initialDelay);
}

async function addSession(username) {
  const userKey = `${REDIS_KEYS.USER_PREFIX}${username}`;
  const serverKey = `${REDIS_KEYS.SERVER_USERS_PREFIX}${SERVER_INSTANCE_ID}`;
  const sessionValue = JSON.stringify({ connectedAt: Date.now() });

  const pipeline = redisClient.multi();
  pipeline.set(userKey, SERVER_INSTANCE_ID);
  pipeline.hset(serverKey, username, sessionValue);
  await pipeline.exec();
}

async function removeSession(username) {
  const userKey = `${REDIS_KEYS.USER_PREFIX}${username}`;
  const serverKey = `${REDIS_KEYS.SERVER_USERS_PREFIX}${SERVER_INSTANCE_ID}`;
  const pipeline = redisClient.multi();
  pipeline.del(userKey);
  pipeline.hdel(serverKey, username);
  await pipeline.exec();
}

async function checkExistingSession(username) {
  const userKey = `${REDIS_KEYS.USER_PREFIX}${username}`;
  const existingServerId = await redisClient.get(userKey);
  if (!existingServerId) return null;

  const heartbeatKey = `${REDIS_KEYS.SERVER_HEARTBEAT_PREFIX}${existingServerId}`;
  const isExistingServerAlive = await redisClient.exists(heartbeatKey);
  return isExistingServerAlive ? existingServerId : null;
}

module.exports = {
  redisClient,
  sub,
  startHeartbeat,
  addSession,
  removeSession,
  checkExistingSession,
};
