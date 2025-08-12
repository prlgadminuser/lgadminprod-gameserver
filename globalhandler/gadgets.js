"use strict";
// joker / gadget config

const gadgetconfig = {
 
    1: {  // SYRINGE = restores 20% of player health
        use_limit: 5,
        cooldown: 500,
       // changevariables: {
      //  starthealth: -0.2,  // Decrease health by 20%
      //  health: -0.2,
     // },
        gadget(player) {
            player.health = Math.min(player.health + Math.round(player.starthealth / 5), player.starthealth);
        }
    },
    
    2: {  // Highspeeder = increases the player speed by 50 %  for 5 seconds
        use_limit: 3,
        cooldown: 10000,
        gadget(player) {
            player.speed = player.speed + player.speed / 2;

            player.timeoutIds.push(setTimeout(() => {
            player.speed = player.startspeed

        }, 5000));
              
        }
    },

    3: {  // bouncetech = bullets do now bounce from walls for 20 seconds
        use_limit: 3,
        cooldown: 30000,
        gadget(player) {
            player.can_bullets_bounce = true
            player.timeoutIds.push(setTimeout(() => {
               player.can_bullets_bounce = false
    
            }, 20000));
                  
            }
        },
    }


module.exports = {
    gadgetconfig
};
