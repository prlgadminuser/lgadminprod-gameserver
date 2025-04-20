
// td in matchtype means team match knockout
// MODIFIERS:
"HealingCircles"
"UseZone"
"AutoHealthRestore"
"AutoHealthDamage"

const gamemodeconfig = {
    1: {
      can_hit_dummies: false,
      can_hit_players: true,

      maxplayers: 5,
      teamsize: 1,
      respawns_allowed: 0,

      playerhealth: 77,
      playerspeed: 1.8,   

      modifiers: [
      "UseZone",
      "AutoHealthRestore",
      ],

      placereward: [10, 8, 6, -1, -5],
      seasoncoinsreward: [25, 17, 12, 10, 7],

      show_timer: false,
      custom_map: 4,
    },

    2: {
      can_hit_dummies: false,
      can_hit_players: true,

      maxplayers: 2,
      teamsize: 1,
      respawns_allowed: 0,

      playerhealth: 150,
      playerspeed: 1.8,

      modifiers: [
        "UseZone",
        "AutoHealthRestore",
        ],

      placereward: [16, -8],
      seasoncoinsreward: [25, 12],

      show_timer: false,
      custom_map: 2,
    },

    3: {
      can_hit_dummies: true,
      can_hit_players: false,

      maxplayers: 1,
      teamsize: 1,
      respawns_allowed: 1,

      playerhealth: 50,
      playerspeed: 1.6,

      modifiers: [
       // "UseZone",
        //"AutoHealthRestore",
        ],

      placereward: [0],
      seasoncoinsreward: [0],

      show_timer: true,
      custom_map: 3,
    },

    4: {
      can_hit_dummies: false,
      can_hit_players: true,

      maxplayers: 8,
      teamsize: 2,
      respawns_allowed: Infinity,

      playerhealth: 100,
      playerspeed: 1.8,

      placereward: [7, -2],
      seasoncoinsreward: [17, 10],
      show_timer: true,

      modifiers: [],

      custom_map: 5,
      matchtype: "td",
    },
  };


  module.exports = {
    gamemodeconfig 
}
