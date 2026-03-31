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

// forceClaimSession.js
// Single file atomic session claim using Redis Lua script
// Prevents double logins / double players across multiple game servers

const FORCE_CLAIM_LUA = `
-- Atomic force claim session with cooldown
-- KEYS[1]   = user session key
-- ARGV[1]   = new server ID
-- ARGV[2]   = current timestamp (ms)
-- ARGV[3]   = cooldown milliseconds (default 3000)

local key       = KEYS[1]
local newSid    = ARGV[1]
local now       = tonumber(ARGV[2])
local cooldown  = tonumber(ARGV[3]) or 3000

-- Read existing session
local existing = redis.call('GET', key)
local oldSid = nil
local oldTime = 0

if existing then
    local data = cjson.decode(existing)
    oldSid = data.sid
    oldTime = tonumber(data.time) or 0
end

-- Cooldown protection
if now - oldTime < cooldown then
    return {0, oldSid or false, oldTime}   -- 0 = failed (cooldown)
end

-- Atomically write new session (1 hour TTL)
local sessionValue = cjson.encode({
    sid  = newSid,
    time = now
})

redis.call('SET', key, sessionValue, 'EX', 3600)

-- Return success + old server ID (for disconnect notification)
return {1, oldSid or false, now}
`;

// Cache the script SHA for better performance (optional but recommended)



let scriptSha;
(async () => {
 scriptSha = await redisClient.script("LOAD", FORCE_CLAIM_LUA);
})();


async function forceClaimSession(redisClient, userId, SERVER_INSTANCE_ID) {
  const userKey = `user:${userId}`;   // Change prefix if needed
  const now = Date.now();


  // Execute atomically
  const result = await redisClient.evalSha(scriptSha, 
      {
        keys: [userKey],                    // KEYS
        arguments: [                        // ARGV
          SERVER_INSTANCE_ID,
          now.toString(),
          '3000'
        ]
      }
    );

  const [success, oldSid] = result;

  if (success === 0) {
    console.log(`⏳ Session claim for user ${userId} rejected (cooldown)`);
    return false;
  }

  // Notify old server to kick the player (if different server)
  if (oldSid && oldSid !== SERVER_INSTANCE_ID) {
    try {
      await redisClient.publish(
        `server:${oldSid}`,
        JSON.stringify({
          type: "disconnect",
          uid: userId,
          reason: "session_claimed_by_another_server"
        })
      );
      console.log(`📢 Sent disconnect to old server ${oldSid} for user ${userId}`);
    } catch (err) {
      console.warn(`⚠️ Failed to publish disconnect for user ${userId}`, err);
    }
  }

  console.log(`✅ Session claimed successfully for user ${userId} on ${SERVER_INSTANCE_ID}`);
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
