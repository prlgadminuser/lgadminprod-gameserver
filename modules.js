// ✅ config aggregator only (no room/battle logic)

// map config
const {
  gridcellsize,
  RealTimeObjectGrid,
  SpatialGrid,
  NotSeenNearbyObjectsGrid,
} = require("@GameConfig/grids");

const { isValidDirection, playerhitbox } = require("@src/GameConfig/player");
const { gamemodeconfig } = require("@src/GameConfig/gamemodes");
const { mapsconfig, random_mapkeys } = require("@src/GameConfig/maps");
const { gadgetconfig } = require("@src/GameConfig/gadgets");
const { gunsconfig } = require("@src/GameConfig/guns");
const {
  matchmaking,
  matchmakingsp,
  SkillbasedMatchmakingEnabled,
} = require("@src/GameConfig/matchmaking");
const {
  game_tick_rate,
  player_idle_timeout,
  maxPlayers,
  maxOpenRooms,
  matchmaking_timeout,
  game_start_time,
  game_win_rest_time,
  room_max_open_time,
  PlayerRateLimiter,
} = require("@src/GameConfig/server");

const {
  deepCopy,
  generateHash,
  arraysEqual,
  arraysEqual2
} = require("@src/Battle/utils/hash");

// ✅ one single export – configs & utils only
module.exports = {
  // game config
  gadgetconfig,
  gamemodeconfig,
  mapsconfig,
  gunsconfig,
  random_mapkeys,
  matchmaking,
  matchmakingsp,
  SkillbasedMatchmakingEnabled,

  // server config
  room_max_open_time,
  game_tick_rate,
  player_idle_timeout,
  maxPlayers,
  maxOpenRooms,
  matchmaking_timeout,
  game_start_time,
  game_win_rest_time,
  PlayerRateLimiter,

  // map config
  gridcellsize,
  RealTimeObjectGrid,
  SpatialGrid,
  NotSeenNearbyObjectsGrid,

  // player config
  playerhitbox,
  isValidDirection,

  // utils
  deepCopy,
  generateHash,
  arraysEqual,
  arraysEqual2
};
