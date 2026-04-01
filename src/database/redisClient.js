// src/database/redisClient.js
const Redis = require("ioredis");
const { rediskey, ServerUrl } = require("../../idbconfig");
const { SERVER_INSTANCE_ID, REDIS_KEYS, HEARTBEAT_TTL_SECONDS, HEARTBEAT_INTERVAL_MS, randomid} = require("../../config");
const {  connectedPlayers } = require("../room/room");

const redisClient = new Redis(rediskey);
const sub = new Redis(rediskey);

const heartbeatKey = `${REDIS_KEYS.SERVER_HEARTBEAT_PREFIX}${SERVER_INSTANCE_ID}`;

const luaEnforceSession = `
local key = KEYS[1]
local newSid = ARGV[1]
local username = ARGV[2]

local oldSid = redis.call('GET', key)

-- If there is an old session on a DIFFERENT server → publish kick to that server
if oldSid and oldSid ~= newSid then
  local kickChannel = 'server:' .. oldSid
  local kickMsg = cjson.encode({
    type = "disconnect",
    uid = username
  })
  redis.call('PUBLISH', kickChannel, kickMsg)
end

-- Always set this as the new active session (new connection wins)
redis.call('SET', key, newSid)
return oldSid or ""
`;

redisClient.on("connect", () => console.log("Connected to redis command client."));
redisClient.on("error", (err) => console.error("Redis command client error:", err));

sub.subscribe(`server:${SERVER_INSTANCE_ID}`, (err) => {
  if (err) console.error("Failed to subscribe to bans channel:", err);
  else console.log("Subscribed to bans channel.", SERVER_INSTANCE_ID);
});


function kickPlayerBan(username) {
   const player = connectedPlayers.get(username);

   if (player && player.close) {
    player.send("client_kick");
  //  console.log("suspended")
    player.close(4009, "You have been banned.");
  }
  
} 

function kickPlayerNewConnection(username) {
   const player = connectedPlayers.get(username);

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

  const userclaimId = randomid()

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
  //await redisClient.set(userKey, sessionValue, 'EX', 3600);

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

  const newSid = SERVER_INSTANCE_ID;

  try {
    await redisClient.eval(luaEnforceSession, 1, userKey, newSid, username);
    console.log(`🔒 Single session enforced for ${username} on server ${newSid} (new connection wins)`);
  } catch (err) {
    console.error(`Session enforcement failed for ${username}:`, err);
    throw err;
  }
}


async function removeSession(username) {
  const userKey = `${REDIS_KEYS.USER_PREFIX}${username}`;
  await redisClient.del(userKey);
}

async function checkExistingSession(username) {
  const userKey = `${USER_PREFIX}${username}`;
  const sid = await redisClient.get(userKey);
  return sid || null; // now returns plain string SID (no JSON parsing)
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
