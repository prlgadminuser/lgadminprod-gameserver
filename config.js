// src/config.js
const { allowed_gamemodes } = require("./src/config/gamemodes");

const HEARTBEAT_INTERVAL_MS = 1000000;

global.playerCount = 0

function serverid ()  {
const serverid =  "xxxxxxxxxx".replace(/[xy]/g, function (c) {
  const r = (Math.random() * 16) | 0;
  const v = c === "x" ? r : (r & 0x3) | 0x8; // Ensures UUID version 4
  return v.toString(16);
}) 
return serverid
}

module.exports = {
  SERVER_INSTANCE_ID: serverid(), //uuidv4(),
  REDIS_KEYS: {
    USER_PREFIX: "battleuser:",
    SERVER_USERS_PREFIX: "users:",
    SERVER_HEARTBEAT_PREFIX: "battleServer_heartbeat:",
  },
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_TTL_SECONDS: HEARTBEAT_INTERVAL_MS / 1000 * 3, // 30 seconds TTL
  WS_OPTIONS: {
    perMessageDeflate: false,
    maxPayload: 10, 
  },
  ALLOWED_ORIGINS: new Set([
    "https://skilldown.io",
    "https://slcount.netlify.app",
    "https://slgame.netlify.app",
    "https://serve.gamejolt.net",
    "http://serve.gamejolt.net",
    "tw-editor://.",
    "https://html-classic.itch.zone",
    "null",
    "https://turbowarp.org",
    "https://liquemgames.itch.io/sr",
    "https://s-r.netlify.app",
    "https://uploads.ungrounded.net",
    "https://prod-dpgames.crazygames.com",
    "https://crazygames.com",
    "https://crazygames.com/game/skilled-royale",
    "https://skilldown.netlify.app",
  ]),
  GAME_MODES: allowed_gamemodes,
  RATE_LIMITS: {
    CONNECTION: { points: 1, duration: 1 },
    MESSAGE: { points: 30, duration: 1 }, // 30 messages per second
  },
};