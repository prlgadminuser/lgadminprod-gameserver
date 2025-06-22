function prepareRoomMessages(room) {
    // Phase 1: Global Room State & Dummies
    handlePlayerMoveIntervalAll(room);

    const isGameRunning = room.state === "playing" || room.state === "countdown";
    const activePlayersCount = Array.from(room.players.values()).reduce((count, player) => count + (!player.eliminated ? 1 : 0), 0);
    const playersValues = Array.from(room.players.values());

    let currentDummiesFiltered;
    // Process dummies data
    if (room.dummies) {
        currentDummiesFiltered = transformData(room.dummies);
        const dummiesHash = generateHash(JSON.stringify(currentDummiesFiltered));

        // Only send dummies if game is running and data has changed from previous tick
        if (isGameRunning) {
            room.dummiesfiltered = (dummiesHash !== room.previousdummies) ? currentDummiesFiltered : undefined;
            room.previousdummies = dummiesHash; // Store hash for next comparison
        } else {
            // Always send dummies if game is not running (e.g., in waiting state)
            room.dummiesfiltered = currentDummiesFiltered;
        }
    } else {
        room.dummiesfiltered = undefined
    }


    // Prepare room data string
    let currentRoomData = [
        state_map[room.state],
        room.zone,
        room.maxplayers,
        activePlayersCount,
        "", // Placeholder, as in original code
        room.countdown,
        room.winner,
    ].join(':');

    // Set roomdata to undefined if it hasn't changed from the last tick for this room
    if (currentRoomData === room.rdlast) {
        currentRoomData = undefined;
    }
    room.rdlast = currentRoomData; // Store for next comparison


    // Phase 2: Aggregate Global Player Movement Data (for all visible players)
    // This data is then filtered per player based on proximity later.
    const allVisiblePlayersData = {};
    for (const player of playersValues) {
        if (player.visible === false) continue; // Skip invisible players

        const formattedBullets = {};
        if (player.bullets && player.bullets.size > 0) {
            player.bullets.forEach(bullet => {
                // Ensure bullet_id is unique enough for string keys if not already
                const bullet_id = bullet.bullet_id;
                const x = bullet.x.toFixed(1);
                const y = bullet.y.toFixed(1);
                const direction = Math.round(bullet.direction);
                const gunid = bullet.gunid;
                formattedBullets[bullet_id] = `${bullet_id}=${x},${y},${direction},${gunid};`;
            });
        }

        const finalBulletsString = Object.keys(formattedBullets).length > 0
            ? "$b" + Object.values(formattedBullets).join("")
            : undefined;

        player.finalbullets = finalBulletsString; // Store on player for later use

        if (isGameRunning) {
            allVisiblePlayersData[player.nmb] = [
                player.x,
                player.y,
                player.direction2,
                player.health,
                player.gun,
                player.emote,
                finalBulletsString // Can be undefined
            ].join(':');
        }
    }


    // Phase 3: Prepare Player-Specific Messages
    for (const player of playersValues) {
        // Reset flags/data for the current tick
        player.tick_send_allow = false;
        player.nearbyids = new Set(); // Reset nearby players tracking for this player

        const nearbyFinalIds = player.nearbyfinalids ? Array.from(player.nearbyfinalids) : [];
        const hitmarkers = player.hitmarkers ? Array.from(player.hitmarkers) : [];
        const eliminations = player.eliminations ? Array.from(player.eliminations) : [];

        // Prepare 'selfdata' which contains player's own specific state
        const currentSelfData = {
            id: player.nmb,
            state: player.state,
            h: player.health,
            sh: player.starthealth,
            s: +player.shooting, // Convert boolean to number (0 or 1)
            g: player.gun,
            kil: player.kills,
            dmg: player.damage,
            rwds: [player.place, player.skillpoints_inc, player.seasoncoins_inc].join('$'),
            killer: player.eliminator,
            cg: +player.canusegadget, // Convert boolean to number
            lg: player.gadgetuselimit,
            ag: +player.gadgetactive, // Convert boolean to number
            x: player.x,
            y: player.y,
            el: JSON.stringify(eliminations),
            em: player.emote,
            spc: player.spectateid,
            guns: player.loadout_formatted,
            np: JSON.stringify(nearbyFinalIds),
            ht: JSON.stringify(hitmarkers),
        };

        // Detect changes in selfData to send only changed fields
        const changedSelfDataFields = {};
        let selfDataHasChanges = false;
        // Compare with the last sent data (stored as player.lastSelfData)
        for (const key in currentSelfData) {
            // Check for existence and difference in value
            if (currentSelfData[key] !== player.lastSelfData?.[key]) {
                changedSelfDataFields[key] = currentSelfData[key];
                selfDataHasChanges = true;
            }
        }
        player.lastSelfData = currentSelfData



        // Filter nearby player data based on what has changed and who is in range
        let filteredNearbyPlayersData = {};
        if (isGameRunning && player.nearbyplayers) {
            const previousHashes = player.pdHashes || {};
            const currentHashes = {};

            for (const [id, data] of Object.entries(allVisiblePlayersData)) {
                if (player.nearbyplayers.has(+id)) { // Check if the player is in range of THIS player
                    const hash = generateHash(data);
                    if (previousHashes[id] !== hash) {
                        filteredNearbyPlayersData[id] = data;
                    }
                    currentHashes[id] = hash;
                    player.nearbyids.add(id); // Keep track of actually nearby player IDs
                }
            }
            player.nearbyfinalids = player.nearbyids; // Update nearbyfinalids for next tick's selfdata
            player.pd = filteredNearbyPlayersData; // Data for this player's message
            player.pdHashes = currentHashes; // Store hashes for next tick
        } else {
            // Clear player-specific movement data if game is not running
            player.pd = {};
            player.pdHashes = {};
            player.nearbyfinalids = new Set(); // No nearby players if game not running
        }


        // Construct the base message elements (room data and dummies)
        const baseMessageContent = {
            rd: currentRoomData,      // Will be undefined if no change
            dm: room.dummiesfiltered, // Will be undefined if no change
        };

        let playerSpecificMessage;
        if (room.state === "waiting") {
            // In waiting state, usually only room data is necessary to avoid spam
            playerSpecificMessage = { rd: baseMessageContent.rd };
        } else {
            // For active game states, include detailed player-specific and global updates
            const messageEntries = [
                ['rd', baseMessageContent.rd],
                ['dm', baseMessageContent.dm],
                ['kf', room.newkillfeed],    // Assumes newkillfeed is already prepared
                ['sb', room.scoreboard],     // Assumes scoreboard is already prepared
                ['sd', finalSelfDataToSend], // Only includes changed self data or full if not running
                ['WLD', room.destroyedWalls],
                ['cl', player.nearbycircles],       // Assumes nearbycircles is prepared
                ['an', player.nearbyanimations],    // Assumes nearbyanimations is prepared
                ['b', player.finalbullets],         // Player's own bullets
                ['pd', player.pd],                  // Filtered nearby player movement data
            ];

            // Build message object, filtering out empty/undefined values
            playerSpecificMessage = Object.fromEntries(
                messageEntries.filter(([key, value]) => {
                    // Filter out undefined, null, empty arrays, or empty objects
                    if (value === undefined || value === null) return false;
                    if (Array.isArray(value) && value.length === 0) return false;
                    if (typeof value === 'object' && Object.keys(value).length === 0) return false;
                    return true;
                })
            );
        }

        // Phase 4: Hash, Compress, and Mark for Sending
        const currentMessageHash = generateHash(JSON.stringify(playerSpecificMessage));
        
        // Only prepare to send if the message content has actually changed
        if (player.ws && player.lastMessageHash !== currentMessageHash) {
            player.lastcompressedmessage = compressMessage(JSON.stringify(playerSpecificMessage));
            player.tick_send_allow = true; // Flag to indicate this player's message should be sent this tick
            player.lastMessageHash = currentMessageHash;
        } else {
            player.tick_send_allow = false; // No change, no need to send
        }
    }

    // Phase 5: Cleanup for Next Tick
    room.destroyedWalls = []; // Clear walls for next tick

    // Clear player-specific transient data that should be fresh each tick
    for (const player of room.players.values()) {
        player.hitmarkers = [];
        player.eliminations = [];
        // Note: player.nearbycircles and player.nearbyanimations also likely need clearing elsewhere
        // or ensure they are reset/updated by their own logic for the next tick.
    }
}