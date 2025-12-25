const RateLimiter = require("../utils/ratelimit");

const TICK_RATE = 40;

function ToMilliseconds(seconds) {
  return seconds * 60 * 1000;
}

const GlobalServerConfig = {
  maxPlayers: 100,
  maxRooms: 6,
};

const GlobalRoomConfig = {
  room_tick_rate_ms: 1000 / TICK_RATE,
  matchmaking_timeout: 30 * 60000,
  game_start_delay: 1000,
  game_win_rest_time: 10000,
  room_max_open_time: 10 * 60000,
  player_noping_maxtime: 5000,
};

function PlayerRateLimiter() {
  return new RateLimiter({
    maxRequests: 10, // max requests per interval
    interval: 0.5, // in time seconds
  });
}

module.exports = { GlobalServerConfig, GlobalRoomConfig, PlayerRateLimiter };
