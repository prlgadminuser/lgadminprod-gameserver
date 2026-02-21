const WebSocket = require("ws");
const Redis = require("ioredis");

const redis = new Redis(); // default localhost:6379
const wss = new WebSocket.Server({ port: 3000 });

const ROOM_SIZE = 4;

function queueKey(mode, skill) {
  return `queue:${mode}:${skill}`;
}

async function findMatch(mode, skill) {
  const key = queueKey(mode, skill);

  const len = await redis.llen(key);
  if (len < ROOM_SIZE) return null;

  // atomic pop
  const players = await redis.lpop(key, ROOM_SIZE);

  // pick lowest-load server
  const server = await redis.zrange("gameservers", 0, 0);

  if (!server.length) throw new Error("No game servers");

  // update load
  await redis.zincrby("gameservers", ROOM_SIZE, server[0]);

  return { players, server: server[0] };
}

wss.on("connection", ws => {
  ws.on("message", async msg => {
    const { playerId, gamemode, skill } = JSON.parse(msg);

    const key = queueKey(gamemode, skill);

    // push player into queue
    await redis.rpush(key, playerId);

    // try match
    const match = await findMatch(gamemode, skill);

    if (match) {
      ws.send(JSON.stringify({
        type: "match_found",
        server: match.server,
        players: match.players
      }));
      ws.close();
    } else {
      ws.send(JSON.stringify({ type: "queued" }));
    }
  });
});
