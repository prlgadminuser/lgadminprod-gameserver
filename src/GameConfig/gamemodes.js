// td in matchtype means team match knockout
// MODIFIERS:

const allowed_gamemodes = new Set([
  "devtest", // only enable in local dev server !!!!

  "1v1",
  "fightdown",
  // "deathmatch",
  //"breakthrough",
  "training",
]);


function generatePlaceReward(maxplayers, rewardRange) {
  if (maxplayers <= 1) return [rewardRange[0]];
  const [maxReward, minReward] = rewardRange;
  const step = (maxReward - minReward) / (maxplayers - 1);
  return Array.from({ length: maxplayers }, (_, i) =>
    Math.round(maxReward - i * step)
  );
}

const gamemodeconfig = {
  devtest: {
    can_hit_dummies: true,
    can_hit_players: false,

    maxplayers: 1,
    teamsize: 1,
    respawns_allowed: 1,

    skillpoints_rewardRange: [10, -5], 
    seasoncoins_rewardRange: [30, 5],

    playerhealth: 999999,
    playerspeed: 1.65,

    modifiers: new Set(["countdown"]),

    weapons_modifiers_override: new Set([]),

    placereward_next: {
      1: { skillpoints: 13, seasoncoins: 25 },
      2: { points: 60, coins: 30 },
      3: { points: 20, coins: 10 },
    },

    placereward: [10, 8, 6, -1, -5],
    seasoncoinsreward: [25, 17, 12, 10, 7],

    custom_map: "prism_party",
  },


  fightdown: {
    can_hit_dummies: false,
    can_hit_players: true,

    maxplayers: 6,
    teamsize: 1,
    respawns_allowed: 0,

    playerhealth: 100,
    playerspeed: 2.5,

    modifiers: new Set(["UseZone", "AutoHealthRestore"]),

    weapons_modifiers_override: new Set(["UseZone", "AutoHealthRestore"]),

    placereward_next: {
      1: { skillpoints: 13, coins: 25 },
      2: { points: 60, coins: 30 },
      3: { points: 20, coins: 10 },
    },

    skillpoints_rewardRange: [10, -5], 
    seasoncoins_rewardRange: [30, 5],

    custom_map: "prism_party",
  },


  "1v1": {
    can_hit_dummies: false,
    can_hit_players: true,

    maxplayers: 2,
    teamsize: 1,
    respawns_allowed: 0,

    playerhealth: 150,
    playerspeed: 1.6,

    modifiers: new Set(["UseZone", "AutoHealthRestore"]),

    weapons_modifiers_override: new Set([]),

    placereward: [16, -8],
    seasoncoinsreward: [25, 12],

    custom_map: "prism_party",
  },


  training: {
    can_hit_dummies: true,
    can_hit_players: false,

    maxplayers: 1,
    teamsize: 1,
    respawns_allowed: 1,

    playerhealth: 50,
    playerspeed: 2.3,

    modifiers: new Set([
      //  "UseZone",
      // AutoHealthRestore,
      //"HealingCircles",
      "countdown"
    ]),

    weapons_modifiers_override: new Set([]),

    placereward: [0],
    seasoncoinsreward: [0],
    
    custom_map: "training",
  },


  deathmatch: {
    can_hit_dummies: false,
    can_hit_players: true,

    maxplayers: 8,
    teamsize: 2,
    respawns_allowed: Infinity,

    playerhealth: 100,
    playerspeed: 1.6,

    placereward: [7, -2],
    seasoncoinsreward: [17, 10],

    modifiers: new Set([]),

    weapons_modifiers_override: new Set([]),


    custom_map: 5,
    matchtype: "td",
  },


  breakthrough: {
    can_hit_dummies: false,
    can_hit_players: true,

    maxplayers: 4,
    teamsize: 1,
    respawns_allowed: 0,

    playerhealth: 200,
    playerspeed: 1.6,

    placereward: [10, 8, 6, 4, -1, -2, -5],
    seasoncoinsreward: [25, 17, 12, 10, 7, 5, 4],
    // show_timer: true,

    modifiers: new Set(["UseZone"]),

    weapons_modifiers_override: new Set(["DestroyWalls"]),


    custom_map: "breakthrough",
    //matchtype: "td"
  },
};


for (const mode of Object.values(gamemodeconfig)) {

  if (mode.skillpoints_rewardRange) mode.placereward = generatePlaceReward(mode.maxplayers, mode.skillpoints_rewardRange)
  if (mode.seasoncoins_rewardRange) mode.seasoncoinsreward = generatePlaceReward(mode.maxplayers, mode.seasoncoins_rewardRange)
//  console.log(mode.placereward, mode.seasoncoinsreward)
}

module.exports = {
  gamemodeconfig: new Map(Object.entries(gamemodeconfig)),
  allowed_gamemodes,
};



