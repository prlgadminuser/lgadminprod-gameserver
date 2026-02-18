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
  else console.log("Subscribed to bans channel.");
});


function kickPlayerBan(username) {
   const player = playerLookup.get(username);

   if (player && player.wsClose) {
    player.send("client_kick");
    player.wsClose(4009, "You have been banned.");
  }
  
} 

function kickPlayerNewConnection(username) {
   const player = playerLookup.get(username);

   if (player && player.wsClose) {
    player.send("code:double");
    player.wsClose(4009, "Reasigned Connection");
  }
}


sub.on("message", (channel, message) => {
    const data = JSON.parse(message);
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
 redisClient.setex(heartbeatKey, HEARTBEAT_TTL_SECONDS,   JSON.stringify({  timestamp: Date.now(),  playercount: global.playerCount,  url: ServerUrl  }));
 setInterval(async () => {
      try {
        await redisClient.setex(
          heartbeatKey, 
          HEARTBEAT_TTL_SECONDS, 
          JSON.stringify({
    timestamp: Date.now(),
    playercount: global.playerCount,
    url: ServerUrl
  })
);
      } catch (error) {
        console.error("Error sending heartbeat to Redis:", error);
      }
    }, HEARTBEAT_INTERVAL_MS);
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

async function getTotalPlayers() {
  // 1. Find keys that start with "battleServer"
  const keys = await redisClient.keys("battleServer*");

  // 2. Fetch their values
  const values = await redisClient.mget(keys);

  // 3. Sum up playercount from JSON
  let totalPlayers = 0;

  for (const v of values) {
    if (!v) continue;
    try {
      const data = JSON.parse(v);
      if (typeof data.playercount === "number") {
        totalPlayers += data.playercount;
      }
    } catch (err) {
      console.error("Invalid JSON in key:", v);
    }
  }
  console.log("Total players across all battle servers:", totalPlayers);


  return totalPlayers;
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
  kickPlayerNewConnection
};