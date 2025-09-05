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

  if (player && player.wsClose) {
    player.send("client_kick");
    player.wsClose(4009, "You have been banned.");
  }
}

sub.on("message", (channel, message) => {
  const data = JSON.parse(message);
  const username = data.uid
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
  const sessionValue = JSON.stringify({ 
    sid: SERVER_INSTANCE_ID, 
    time: Date.now() 
  });

  await redisClient.set(userKey, sessionValue);
}

async function removeSession(username) {
  const userKey = `${REDIS_KEYS.USER_PREFIX}${username}`;
  await redisClient.del(userKey);
}

async function checkExistingSession(username) {
  const userKey = `${REDIS_KEYS.USER_PREFIX}${username}`;
  const sessionValue = await redisClient.get(userKey);

  if (!sessionValue) return null;

  let parsed;
  try {
    parsed = JSON.parse(sessionValue);
  } catch {
    return null;
  }

  const heartbeatKey = `${REDIS_KEYS.SERVER_HEARTBEAT_PREFIX}${parsed.sid}`;
  const isExistingServerAlive = await redisClient.exists(heartbeatKey);
  
  return isExistingServerAlive ? parsed.sid : null;
}


module.exports = {
  redisClient,
  sub,
  startHeartbeat,
  addSession,
  removeSession,
  checkExistingSession,
};