
const { handlePlayerCollision, handleDummyCollision } = require("./player")

function AddAffliction(room, shootingPlayer, target, data) {

    const { target_type, damage, speed, duration, gunid, dummykey } = data

    const interval = setInterval(() => {


        if (!target) return
        
        if (target.type === "dummy") {

        handleDummyCollision(room, player, dummykey, damage)
           
        } else if (target.type === "player") {

        handlePlayerCollision(room, player, target, damage, gunid)

        }

    }, speed);


    room.intervalIds.push(interval)

    room.timeoutIds.push(setTimeout(() => {
        clearInterval(interval)
    }, duration));
}

// AddAffliction(room, target, shootingPlayer, damage, speed, duration)

module.exports = { AddAffliction }