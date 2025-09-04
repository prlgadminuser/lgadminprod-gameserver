

const { DBuserCollection, DBbattlePassCollection, DBshopCollection } = require("./mongoClient");



function isRewardNumberInRange(value, min, max) {
  // Check if value is a finite number
  if (typeof value !== "number" || !isFinite(value)) {
    return false;
  }
  // Check if value is within the specified range
  return value >= min && value <= max;
}

async function UpdatePlayerPlace(player, place2, room) {
  if (player.place_awarded) {
    return;
  }
  player.place_awarded = true;

  const username = player.playerId;
  const place = +place2;

  if (isNaN(place) || place < 1 || place > 10) {
    return;
  }

  try {
    const skillpoints = +room.place_counts[place - 1];
    const season_coins = +room.ss_counts[place - 1];

    if (isNaN(skillpoints) || isNaN(season_coins)) {
      return;
    }

    if (
      !isRewardNumberInRange(skillpoints, -30, 30) ||
      !isRewardNumberInRange(season_coins, 0, 60)
    )
      return;

    player.skillpoints_inc = skillpoints;
    player.seasoncoins_inc = season_coins;

    player.finalrewards = [place2, skillpoints, season_coins];

    if (skillpoints !== 0) {
      await DBuserCollection.updateOne(
        { "account.username": username },
        [
          {
            $set: {
              "stats.sp": { $max: [0, { $add: ["$stats.sp", skillpoints] }] },
            },
          },
        ],
        { hint: "playerProfileIndex" } // <-- Using index hint
      );
    }

    await DBbattlePassCollection.updateOne(
      { username },
      {
        $inc: {
          ss_coins: season_coins,
        },
      },
      {
        upsert: true,
      }
    );
  } catch (error) {
    console.error(
      "Error updating damage in the database:",
      JSON.stringify(error)
    );
  }
}

async function UpdatePlayerKillsAndDamage(player) {
  if (player.killsndamage_awarded) {
    return;
  }
  player.killsndamage = true;

  const username = player.playerId;
  const killcount = +player.kills;
  const damagecount = +player.damage;

  if (isNaN(killcount) || isNaN(damagecount)) {
    return { error: "Invalid count provided" };
  }

  if (
    !isRewardNumberInRange(killcount, 1, 100) ||
    !isRewardNumberInRange(damagecount, 1, 5000)
  )
    return;

  const updateObject = {
    $inc: {
      ...(killcount > 0 && { "stats.kills": killcount }),
      ...(damagecount > 0 && { "stats.damage": damagecount }),
    },
  };

  try {
    if (Object.keys(updateObject.$inc).length > 0) {
      const incrementResult = await DBuserCollection.updateOne(
        { "account.username": username },
        updateObject,
        { hint: "playerProfileIndex" } // <-- Using index hint
      );

      if (
        (damagecount > 0 && incrementResult.modifiedCount > 0) ||
        incrementResult.upsertedCount > 0
      ) {
        // If player's kill count was updated or a new player document was inserted
        await DBbattlePassCollection.updateOne(
          { username },
          {
            $inc: {
              ss_damage: damagecount,
            },
          },
          {
            upsert: true,
          }
        );
      }

      if (
        (killcount > 0 && incrementResult.modifiedCount > 0) ||
        incrementResult.upsertedCount > 0
      ) {
        // If player's kill count was updated or a new player document was inserted
        const eventKillUpdate = await DBshopCollection.updateOne(
          { _id: "eventKillsCounter" },
          { $inc: { eventKills: killcount } } // Increment the eventKills by the number of kills
        );

        if (eventKillUpdate.modifiedCount === 0) {
          return { error: "Failed to update event kill counter" };
        }

        return {
          success: true,
          message: "Player kills and event counter updated successfully",
        };
      } else {
        return { error: "User not found or kill count not updated" };
      }
    }
  } catch (error) {
    console.error("Error updating kills in the database:", error);
    return { error: "Database error" };
  }
}

async function UpdatePlayerWins(player) {
  if (player.wins_awarded) {
    return;
  }
  player.wins_awarded = true;

  const username = player.playerId;
  const wins = 1;

  if (isNaN(wins)) {
    return { error: "Invalid damage count provided" };
  }

  try {
    await DBuserCollection.updateOne(
      { "account.username": username },
      { $inc: { "stats.wins": wins } },
      { hint: "playerProfileIndex" }
    );
  } catch (error) {
    console.error("Error updating damage in the database:", error);
  }
}


async function checkForMaintenance() {
  let maintenanceMode = false;

  try {
    // Find the maintenanceStatus directly from the document
    const result = await DBshopCollection.findOne(
      { _id: "maintenance" },
      { projection: { status: 1 } } // Only retrieve the maintenanceStatus field
    );

    if (result.status === "await" || result.status === "true") {
      maintenanceMode = true;
    } else {
      maintenanceMode = false;
    }
  } catch (error) {
    console.error("Error checking maintenance status:", error);
    maintenanceMode = true;
  }

  return maintenanceMode;
}



module.exports = {
  UpdatePlayerPlace,
  UpdatePlayerKillsAndDamage,
  UpdatePlayerWins,
  checkForMaintenance
};
