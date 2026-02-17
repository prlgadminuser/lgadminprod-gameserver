
function bullets(count, options = {}) {
    const {
        speed = 13,
        delay = 0,
        offset = 0,
        angleOffset = 0
    } = options;

    return Array.from({ length: count }, (_, i)  => (
      
      {
      
        angle: angleOffset + i * (360 / count),
        speed,
        delay,
        offset
    }));


}

  // ...bullets(100, { angle: 45, speed: 13, delay: 0, offset: 0  })


const gunsconfig = {
  1: {
    // Default pistol
    modifiers: new Set([
  //    "CanBounce",
 //   "DestroyWalls",
    ]),
    cooldown: 500,
    distance: 300,
    maxexistingtime: 1600,
    damage: 20,
    width: 25,
    height: 7,
    useplayerangle: true,
    bullets: [
  //  ...bullets(10, { angle: 0, speed: 4, delay: 0, offset: 0  })
     { angle: 0, speed: 18, delay: 70, offset: 10 },

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
      { threshold: 60, damageMultiplier: 0.7 },
      { threshold: 100, damageMultiplier: 0.25 },
    ],
  },

  2: {
    // Default Shotgun
    modifiers: new Set([
      //   "CanBounce",
      //   "DestroyWalls"
    ]),
    cooldown: 800,
    distance: 250,
    maxexistingtime: 1000,
    damage: 10,
    width: 27,
    height: 6,
    useplayerangle: true,
    //can_bullets_bounce: false,
    bullets: [
      { angle: -5, speed: 18, delay: 0, offset: 0 },
      { angle: 0, speed: 18, delay: 0, offset: 0 },
      { angle: 5, speed: 18, delay: 0, offset: 0 },
    ],
    damageconfig: [
      { threshold: 25, damageMultiplier: 1 },
      { threshold: 55, damageMultiplier: 0.7 },
      { threshold: 100, damageMultiplier: 0.4 },
    ],
  },

  3: {
    // Default Sniper
    modifiers: new Set([
      //  "CanBounce",
      // "DestroyWalls"
    ]),
    cooldown: 600,
    distance: 1200,
    maxexistingtime: 5000,
    damage: 25,
    width: 33,
    height: 7,
    useplayerangle: true,
    //  can_bullets_bounce: true,
    bullets: [{ angle: 0, speed: 23, delay: 0, offset: 0 }],
    damageconfig: [
      { threshold: 45, damageMultiplier: 1 },
      { threshold: 80, damageMultiplier: 0.8 },
      { threshold: 100, damageMultiplier: 0.7 },
      // You can add more layers here
    ],
  },

  4: {
    // XNITRO SMG
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
      { angle: 0, speed: 24, delay: 0, offset: 0 },
      { angle: 2, speed: 24, delay: 50, offset: 3 },
      { angle: -2, speed: 24, delay: 100, offset: 6 },
    ],
    damageconfig: [
      // { threshold: 50, damageMultiplier: 1 },
      // { threshold: 100, damageMultiplier: 0.70 },
      // { threshold: 150, damageMultiplier: 0.40 }
    ],
  },

  5: {
    // ARCADE BLASTER
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

    afflictionConfig: {
      damage: 5,
      waitTime: 1000,
      activeTime: 10000,
    },
  },

  DEVLOCKED: {
    // DEV WEAPON - UNRELEASED - DONT USE!!!!!!!
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
      { threshold: 100, damageMultiplier: 1 }, // Layer 4: 1/4 damage if within 100% of max distance
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





