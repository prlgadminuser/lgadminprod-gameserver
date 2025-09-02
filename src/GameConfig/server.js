
const Limiter = require("limiter").RateLimiter;

const maxPlayers = 100;
const maxOpenRooms = 100;


const TICK_RATE = 70 // add one more for smoothness // use 70 for local
const game_tick_rate =  1000 / TICK_RATE;
const player_idle_timeout = 10000;
const PlayerMaxRequestsPerSecond = 30

const matchmaking_timeout = 30 * 60 * 1000; // 30 mins
const game_start_time = 1000;
const game_win_rest_time = 10000;
const room_max_open_time = 10 * 60 * 1000; // 10 mins

function PlayerRateLimiter() {
  return new Limiter({
    tokensPerInterval: PlayerMaxRequestsPerSecond,
    interval: 1000, // milliseconds
  });
}

module.exports = { game_tick_rate, player_idle_timeout, maxPlayers, maxOpenRooms, matchmaking_timeout, game_start_time, game_win_rest_time, room_max_open_time, PlayerRateLimiter }