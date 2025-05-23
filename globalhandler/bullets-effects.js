
function AddAffliction(room, target, shootingPlayer, damage, speed, duration) {

    const interval = setInterval(() => {

        target.health -= damage

        const hit = `${target.x}:${target.y}:${damage}`

        shootingPlayer.hitmarkers.push(hit);

    }, speed);


    room.intervalIds.push(interval)

    room.timeoutIds.push(setTimeout(() => {
        clearInterval(interval)
    }, duration));
}

// AddAffliction(room, target, shootingPlayer, damage, speed, duration)

module.exports = { AddAffliction }