// src/config.js
const { v4: uuidv4 } = require("uuid");
const { allowed_gamemodes } = require("./src/GameConfig/gamemodes");

const HEARTBEAT_INTERVAL_MS = 1000000;

module.exports = {
  SERVER_INSTANCE_ID: uuidv4(),
  REDIS_KEYS: {
    USER_PREFIX: "user:",
    SERVER_USERS_PREFIX: "users:",
    SERVER_HEARTBEAT_PREFIX: "server_heartbeat:",
  },
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_TTL_SECONDS: HEARTBEAT_INTERVAL_MS / 1000 * 3, // 30 seconds TTL
  WS_OPTIONS: {
    perMessageDeflate: false,
    maxPayload: 10, // 10MB
  },
  ALLOWED_ORIGINS: new Set([
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