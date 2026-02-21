
const TICK_RATE = 40;

function ToMilliseconds(seconds) {
  return seconds * 60 * 1000;
}

const GlobalServerConfig = {
  maxPlayers: 100,
  maxRooms: 6,
};

const GlobalRoomConfig = {
  ticks_per_second: TICK_RATE,
  room_tick_rate_ms: 1000 / TICK_RATE,
  matchmaking_timeout: 30 * 60000,
  game_start_delay: 1000,
  game_win_rest_time: 4000,
  room_max_open_time: 10 * 60000,
  player_noping_maxtime: 5000,
  bullet_updates_per_tick: 20,
};



module.exports = { GlobalServerConfig, GlobalRoomConfig };
