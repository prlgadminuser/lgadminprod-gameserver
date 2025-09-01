
const gunsconfig = {

  1: {  // Default pistol
    modifiers: new Set([
      // "CanBounce",
       "DestroyWalls"
    ]),
    cooldown: 500,
    distance: 300,
    maxexistingtime: 400,
    damage: 12,
    width: 25,
    height: 7,
    useplayerangle: true,
    bullets: [
      { angle: 0, speed: 30, delay: 0, offset: 0 },
      { angle: 0, speed: 30, delay: 70, offset: 10 },

      /* { angle: 90, speed: 13, delay: 0, offset: 0 },
       { angle: 0, speed: 13, delay: 0, offset: 0 },
       { angle: 180, speed: 13, delay: 0, offset: 0 },
       { angle: -90, speed: 13, delay: 0, offset: 0 },
       { angle: 45, speed: 13, delay: 0, offset: 0 },
       { angle: -45, speed: 13, delay: 0, offset: 0 },
       { angle: -135, speed: 13, delay: 0, offset: 0 },
       { angle: 135, speed: 13, delay: 0, offset: 0 }
 
       */
    ],
    damageconfig: [
      { threshold: 35, damageMultiplier: 1 },
      { threshold: 60, damageMultiplier: 0.70 },
      { threshold: 100, damageMultiplier: 0.25 }

    ],
  },

  2: { // Default Shotgun
    modifiers: new Set([
      //   "CanBounce",
      //   "DestroyWalls"
    ]),
    cooldown: 800,
    distance: 250,
    maxexistingtime: 500,
    damage: 10,
    width: 27,
    height: 6,
    useplayerangle: true,
    //can_bullets_bounce: false,
    bullets: [
      { angle: -5, speed: 27, delay: 0, offset: 0 },
      { angle: 0, speed: 27, delay: 0, offset: 0 },
      { angle: 5, speed: 27, delay: 0, offset: 0 },
    ],
    damageconfig: [
      { threshold: 25, damageMultiplier: 1 },
      { threshold: 55, damageMultiplier: 0.8 },
      { threshold: 100, damageMultiplier: 0.30 }
    ],
  },

  3: { // Default Sniper
    modifiers: new Set([
      // "CanBounce",
      // "DestroyWalls"
    ]),
    cooldown: 600,
    distance: 1200,
    maxexistingtime: 20000,
    damage: 25,
    width: 33,
    height: 7,
    useplayerangle: true,
    //  can_bullets_bounce: true,
    bullets: [
      { angle: 0, speed: 37, delay: 0, offset: 0 },


    ],
    damageconfig: [
      { threshold: 45, damageMultiplier: 1 },
      { threshold: 80, damageMultiplier: 0.80 },
      { threshold: 100, damageMultiplier: 0.70 }
      // You can add more layers here
    ],
  },

  4: {  // XNITRO SMG
    modifiers: new Set([
     // "CanBounce",
      //  "DestroyWalls"
    ]),
    cooldown: 300,
    distance: 350,
    maxexistingtime: 400,
    damage: 4,
    width: 33,
    height: 6,
    useplayerangle: true,
    //can_bullets_bounce: true,
    bullets: [
      { angle: 0, speed: 35, delay: 0, offset: 0 },
      { angle: 2, speed: 34, delay: 50, offset: 3 },
      { angle: -2, speed: 34, delay: 100, offset: 6 }
    ],
    damageconfig: [
      // { threshold: 50, damageMultiplier: 1 },
      // { threshold: 100, damageMultiplier: 0.70 },
      // { threshold: 150, damageMultiplier: 0.40 }
    ],
  },

  5: {  // ARCADE BLASTER
    modifiers: new Set([
     // "Spinning"
    // "CanBounce",
      // "DestroyWalls"
    ]),
  //  spinning_speed: 5,
    cooldown: 700,
    distance: 1000,
    maxexistingtime: 500,
    damage: 10,
    width: 14,
    height: 58,
    useplayerangle: true,
    bullets: [
      { angle: 0, speed: 25, delay: 0, offset: 0 },
      { angle: 0, speed: 25, delay: 200, offset: 0 },
      { angle: 0, speed: 25, delay: 400, offset: 0 },
    ],
    damageconfig: [
      //  { threshold: 150, damageMultiplier: 1 },
      //  { threshold: 300, damageMultiplier: 0.5 }
    ],
  },

  DEVLOCKED: { // DEV WEAPON - UNRELEASED - DONT USE!!!!!!!
    cooldown: 300,
    distance: 250,
    maxexistingtime: 5000,
    maxbounces: 5,
    damage: 6,
    width: 49,
    height: 49,
    useplayerangle: true,
    // can_bullets_bounce: true,
    bullets: [
      // Shotgun pellets configuration
      { angle: -8, speed: 25, delay: 0, offset: 40 },
      { angle: -8, speed: 25, delay: 0, offset: 20 },
      //  { angle: -8, speed: 25, delay: 0, offset: 0 },
      //  { angle: -5, speed: 27, delay: 0, offset: 0 },
      { angle: 0, speed: 13, delay: 0, offset: 0 },
      // { angle: 5, speed: 27, delay: 0, offset: 0 },
      //   { angle: 8, speed: 25, delay: 0, offset: 0 }
    ],
    damageconfig: [
      { threshold: 100, damageMultiplier: 1 } // Layer 4: 1/4 damage if within 100% of max distance
      // You can add more layers here
    ],
  },

};


/* 1: {
    cooldown: 800,
    distance: 300,
    maxexistingtime: 2000,
    maxbounces: 5,
    damage: 5,
    width: 5,
    height: 5,
    useplayerangle: false,
    bullets: [
             { angle: 0, speed: 30, delay: 0, offset: 0 },
       { angle: 0, speed: 30, delay: 50, offset: 10 },
       { angle: 0, speed: 30, delay: 100, offset: -10 },
         { angle: 0, speed: 30, delay: 150, offset: 0 },
       { angle: 0, speed: 30, delay: 200, offset: 10 },
       { angle: 0, speed: 30, delay: 250, offset: -10 },
     /* { angle: 90, speed: 13, delay: 0, offset: 0 },
      { angle: 0, speed: 13, delay: 0, offset: 0 },
      { angle: 180, speed: 13, delay: 0, offset: 0 },
      { angle: -90, speed: 13, delay: 0, offset: 0 },
      { angle: 45, speed: 13, delay: 0, offset: 0 },
      { angle: -45, speed: 13, delay: 0, offset: 0 },
      { angle: -135, speed: 13, delay: 0, offset: 0 },
      { angle: 135, speed: 13, delay: 0, offset: 0 }

  ]
  },
      */


module.exports = {
  gunsconfig,
  //gunsconfig: new Map(Object.entries(gunsconfig)),
  gunskeys: Object.keys(gunsconfig)
};