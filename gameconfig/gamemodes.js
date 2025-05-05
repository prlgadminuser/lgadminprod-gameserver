// td in matchtype means team match knockout
// MODIFIERS:


const allowed_gamemodes = new Set([
  
  "fightdown",
  "1v1",
 // "deathmatch",
  "breakthrough",
  "training",


])

const gamemodeconfig = {
  fightdown: {
    can_hit_dummies: false,
    can_hit_players: true,

    maxplayers: 5,
    teamsize: 1,
    respawns_allowed: 0,

    playerhealth: 77,
    playerspeed: 1.5,   

    modifiers: new Set([
      "UseZone",
      "AutoHealthRestore",
    ]),

    placereward_next: {
      1: { skillpoints: 13, coins: 25 },
      2: { points: 60, coins: 30 },
      3: { points: 20, coins: 10 }
    },

    placereward: [10, 8, 6, -1, -5],
    seasoncoinsreward: [25, 17, 12, 10, 7],

    show_timer: false,
    custom_map: 4,
  },

  "1v1": {
    can_hit_dummies: false,
    can_hit_players: true,

    maxplayers: 2,
    teamsize: 1,
    respawns_allowed: 0,

    playerhealth: 150,
    playerspeed: 1.5,

    modifiers: new Set([
      "UseZone",
      "AutoHealthRestore",
    ]),

    placereward: [16, -8],
    seasoncoinsreward: [25, 12],

    show_timer: false,
    custom_map: 2,
  },

  training: {
    can_hit_dummies: true,
    can_hit_players: false,

    maxplayers: 1,
    teamsize: 1,
    respawns_allowed: 1,

    playerhealth: 50,
    playerspeed: 1.5,

    modifiers: new Set([
    //  "UseZone",
      // AutoHealthRestore,
    ]),

    placereward: [0],
    seasoncoinsreward: [0],

    show_timer: true,
    custom_map: "training",
  },

  deathmatch: {
    can_hit_dummies: false,
    can_hit_players: true,

    maxplayers: 8,
    teamsize: 2,
    respawns_allowed: Infinity,

    playerhealth: 100,
    playerspeed: 1.5,

    placereward: [7, -2],
    seasoncoinsreward: [17, 10],
    show_timer: true,

    modifiers: new Set([]),

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
    playerspeed: 1.2,

    placereward: [10, 8, 6, 4, -1, -2, -5],
    seasoncoinsreward: [25, 17, 12, 10, 7, 5, 4],
   // show_timer: true,

    modifiers: new Set([
      "UseZone",
      "AutoHealthRestore",
      "HealingCircles",
    ]),

 

    custom_map: "breakthrough",
    //matchtype: "td"
  },
};

module.exports = {
  gamemodeconfig,
  allowed_gamemodes
}
