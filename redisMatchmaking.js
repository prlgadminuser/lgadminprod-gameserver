const WebSocket = require("ws");
const Redis = require("ioredis");

const redis = new Redis();
const wss = new WebSocket.Server({ port: 3000 });

/* ===========================
   AUTHORITATIVE CONFIG
=========================== */

const GAME_MODES = {
  deathmatch: { maxPlayers: 4, minSkill: 0, maxSkill: 3000, bucketSize: 250 },
  ranked:     { maxPlayers: 6, minSkill: 500, maxSkill: 5000, bucketSize: 200 },
  duo:        { maxPlayers: 2, minSkill: 0, maxSkill: 3000, bucketSize: 300 }
};

/* ===========================
   REDIS LUA SCRIPT
   Atomic matchmaking
=========================== */

const MATCHMAKE_LUA = `
-- KEYS:
-- 1 = queue key
-- 2 = gameservers zset
-- 3 = queued_players set

-- ARGV:
-- 1 = maxPlayers

local queueKey = KEYS[1]
local serversKey = KEYS[2]
local queuedSet = KEYS[3]
local maxPlayers = tonumber(ARGV[1])

local len = redis.call("LLEN", queueKey)
if len < maxPlayers then
    return nil
end

-- atomic pop
local players = redis.call("LPOP", queueKey, maxPlayers)

-- pick lowest-load server
local server = redis.call("ZRANGE", serversKey, 0, 0)
if #server == 0 then
    -- rollback if no server
    for i = 1, #players do
        redis.call("LPUSH", queueKey, players[i])
    end
    return nil
end

local serverId = server[1]

-- update server load
redis.call("ZINCRBY", serversKey, maxPlayers, serverId)

-- remove queued flags
for i = 1, #players do
    redis.call("SREM", queuedSet, players[i])
end

return { serverId, unpack(players) }
`;

// load script
let MATCHMAKE_SHA;
(async () => {
  MATCHMAKE_SHA = await redis.script("LOAD", MATCHMAKE_LUA);
  console.log("Matchmaking script loaded:", MATCHMAKE_SHA);
})();

/* ===========================
   HELPERS
=========================== */

function validateInput({ playerId, gamemode, skill }) {
  if (!playerId || typeof playerId !== "string") return "Invalid playerId";

  const mode = GAME_MODES[gamemode];
  if (!mode) return "Invalid gamemode";

  if (typeof skill !== "number") return "Invalid skill";
  if (skill < mode.minSkill || skill > mode.maxSkill) return "Skill out of range";

  return null;
}

function skillBucket(skill, size) {
  return Math.floor(skill / size) * size;
}

function queueKey(mode, bucket) {
  return `queue:${mode}:${bucket}`;
}

/* ===========================
   ATOMIC MATCHMAKING CALL
=========================== */

async function atomicMatchmake(gamemode, bucket) {
  const mode = GAME_MODES[gamemode];
  const qKey = queueKey(gamemode, bucket);

  const res = await redis.evalsha(
    MATCHMAKE_SHA,
    3,
    qKey,
    "gameservers",
    "queued_players",
    mode.maxPlayers
  );

  if (!res) return null;

  const [server, ...players] = res;
  return { server, players };
}

/* ===========================
   WEBSOCKET SERVER
=========================== */

wss.on("connection", ws => {
  ws.on("message", async msg => {
    let data;

    try {
      data = JSON.parse(msg);
    } catch {
      ws.send(JSON.stringify({ type: "error", error: "Invalid JSON" }));
      return ws.close();
    }

    const err = validateInput(data);
    if (err) {
      ws.send(JSON.stringify({ type: "error", error: err }));
      return ws.close();
    }

    const { playerId, gamemode, skill } = data;
    const mode = GAME_MODES[gamemode];
    const bucket = skillBucket(skill, mode.bucketSize);
    const qKey = queueKey(gamemode, bucket);

    // prevent duplicate queueing
    const alreadyQueued = await redis.sismember("queued_players", playerId);
    if (alreadyQueued) {
      ws.send(JSON.stringify({ type: "error", error: "Already queued" }));
      return ws.close();
    }

    // queue player
    await redis.sadd("queued_players", playerId);
    await redis.rpush(qKey, playerId);

    // atomic match
    const match = await atomicMatchmake(gamemode, bucket);

    if (match) {
      ws.send(JSON.stringify({
        type: "match_found",
        server: match.server,
        players: match.players,
        gamemode
      }));
      ws.close();
    } else {
      ws.send(JSON.stringify({ type: "queued" }));
    }
  });
});

/* ===========================
   BOOTSTRAP DATA (example)
=========================== */

// Example game servers
(async () => {
  await redis.zadd("gameservers", 0, "gs1");
  await redis.zadd("gameservers", 0, "gs2");
  await redis.zadd("gameservers", 0, "gs3");
})();

console.log("Atomic matchmaking server running on :3000");