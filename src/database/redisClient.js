// src/database/redisClient.js
const Redis = require("ioredis");
const { rediskey, ServerUrl } = require("../../idbconfig");
const { SERVER_INSTANCE_ID, REDIS_KEYS, HEARTBEAT_TTL_SECONDS, HEARTBEAT_INTERVAL_MS} = require("../../config");
const { playerLookup } = require("../room/room");

const redisClient = new Redis(rediskey);
const sub = new Redis(rediskey);

const heartbeatKey = `${REDIS_KEYS.SERVER_HEARTBEAT_PREFIX}${SERVER_INSTANCE_ID}`;

redisClient.on("connect", () => console.log("Connected to redis command client."));
redisClient.on("error", (err) => console.error("Redis command client error:", err));

sub.subscribe(`server:${SERVER_INSTANCE_ID}`, (err) => {
  if (err) console.error("Failed to subscribe to bans channel:", err);
  else console.log("Subscribed to bans channel.", SERVER_INSTANCE_ID);
});


function kickPlayerBan(username) {
   const player = playerLookup.get(username);

   if (player && player.close) {
    player.send("client_kick");
  //  console.log("suspended")
    player.close(4009, "You have been banned.");
  }
  
} 

function kickPlayerNewConnection(username) {
   const player = playerLookup.get(username);

   if (player && player.close) {
    player.send("code:double");
    player.close(4009, "Reasigned Connection");
  }
}


sub.on("message", (channel, message) => {
    const data = JSON.parse(message);
   // console.log(data)
    const type = data.type;
    const username = data.uid
    switch (type) {
      case "ban":
      kickPlayerBan(username);
        break;
      case "disconnect":
        kickPlayerNewConnection(username);    
        break;
    }
});

function startHeartbeat() {
  const serverKey = ServerUrl;                 // e.g. ws://10.0.0.2:5000
  const healthKey = `health:${ServerUrl}`;     // health tracker

  async function heartbeat() {
    try {
      const playerCount = global.playerCount;

      // 1) Update server load (used by matchmaker)
      await redisClient.zadd("gameservers", playerCount, serverKey);

      // 2) Health TTL (used for liveness detection)
      await redisClient.setex(
        healthKey,
        HEARTBEAT_TTL_SECONDS,
        "ok"
      );

   /*   // 3) Optional metadata (debug/monitoring)
      await redisClient.setex(
        `meta:${ServerUrl}`,
        HEARTBEAT_TTL_SECONDS,
        JSON.stringify({
          timestamp: Date.now(),
          playercount: playerCount,
          url: ServerUrl
        })
      );
*/
    } catch (error) {
      console.error("Heartbeat error:", error);
    }
  }

  // run immediately
  heartbeat();

  // run continuously
  setInterval(heartbeat, HEARTBEAT_INTERVAL_MS);
}

async function forceClaimSession(userId) {
  const userKey = `${REDIS_KEYS.USER_PREFIX}${userId}`;

  const now = Date.now();
  const sessionValue = JSON.stringify({ sid: SERVER_INSTANCE_ID, time: now });

  // Get old session before overwriting
  const existingSession = await redisClient.get(userKey);
  let oldSid = null;
  if (existingSession) {
    try {
      oldSid = JSON.parse(existingSession).sid;
    } catch {}
  }

  // Overwrite session atomically

  // Notify old server to disconnect
  if (oldSid) {
    await redisClient.publish(
      `server:${oldSid}`,
      JSON.stringify({ type: "disconnect", uid: userId })
    );
  }

   await redisClient.set(userKey, sessionValue, 'EX', 3600);

  // Success — this server now owns the session
  return true;
}

async function addSession(username) {
  const userKey = `${REDIS_KEYS.USER_PREFIX}${username}`;
  const sessionValue = JSON.stringify({ 
    sid: SERVER_INSTANCE_ID, 
    time: Date.now() 
  });

  await redisClient.setex(
    userKey, 
    3600,
    sessionValue);
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

  //const heartbeatKey = `${REDIS_KEYS.SERVER_HEARTBEAT_PREFIX}${parsed.sid}`;
 // const isExistingServerAlive = await redisClient.exists(heartbeatKey);
  
//  return isExistingServerAlive ? parsed.sid : null;
   
  return parsed.sid;
}





// usage
//getTotalPlayers();



module.exports = {
  redisClient,
  sub,
  startHeartbeat,
  addSession,
  removeSession,
  checkExistingSession,
  kickPlayerNewConnection,
  forceClaimSession
};
