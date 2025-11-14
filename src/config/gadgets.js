
// Utility functions
function enableGadget(player, changes = {}) {
    player.gadgetBackup = player.gadgetBackup || {};
    
    for (const key in changes) {
        // Backup original value only once
        if (!(key in player.gadgetBackup)) {
            player.gadgetBackup[key] = player[key];
        }
        player[key] = changes[key];
    }

    player.gadgetactive = true;
}

function disableGadget(player) {
    if (!player.gadgetBackup) return;

    for (const key in player.gadgetBackup) {
        player[key] = player.gadgetBackup[key];
    }

    player.gadgetBackup = {}; // Clear backup
    player.gadgetactive = false;
}

// Gadget configuration
const gadgetconfig = {
    1: {  // SYRINGE = restores 20% of player health
        use_limit: 5,
        cooldown: 500,
        gadget(player) {
            const healthToAdd = Math.round(player.starthealth / 5);  // 20%
            player.health = Math.min(player.health + healthToAdd, player.starthealth);
        }
    },

    2: {  // Highspeeder = increases player speed by 50% for 5 seconds
        use_limit: 3,
        cooldown: 10000,
        gadget(player) {
            const boostedSpeed = player.speed + player.speed / 2;
            enableGadget(player, { speed: boostedSpeed });

            
            room.setRoomTimeout(() => {
              disableGadget(player);
            }, 5000);

        }
    },

    3: {  // Bouncetech = bullets bounce from walls for 20 seconds
        use_limit: 3,
        cooldown: 30000,
        gadget(player) {
            enableGadget(player, { can_bullets_bounce: true });

             room.setRoomTimeout(() => {
                disableGadget(player);
            }, 20000);
        }
    },
};

module.exports = {
   gadgetconfig 
};
