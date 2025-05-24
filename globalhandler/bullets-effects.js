
const { handlePlayerCollision, handleDummyCollision } = require("./player")

function AddAffliction(room, shootingPlayer, target, data) {

    const { target_type, damage, speed, duration, gunid, dummykey } = data



    const interval = setInterval(() => {

        if (!target) {
            clearInterval(interval);
            return;
        }

        if (target_type === "player" && !target.visible) {
            clearInterval(interval);
            return;
        }


        
        if (target_type === "dummy") {
        handleDummyCollision(room, shootingPlayer, dummykey, damage)    
        } else if (target_type === "player") {
        handlePlayerCollision(room, shootingPlayer, target, damage, gunid)
        }



    }, speed);


    

    room.intervalIds.push(interval)

    room.timeoutIds.push(setTimeout(() => {
        clearInterval(interval)
    }, duration));
}

// AddAffliction(room, target, shootingPlayer, damage, speed, duration)

module.exports = { AddAffliction }