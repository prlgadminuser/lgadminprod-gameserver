"use strict";

const { shopcollection, userCollection, battlePassCollection, jwt } = require('./..//index.js');
const { tokenkey } = require('./..//idbconfig.js');

const maintenanceId = "maintenance"; 

async function verifyPlayer(token) {
  if (!token) {
    throw new Error("Unauthorized");
  }

  try {

     const tokenExists = await userCollection.findOne({ "account.token": token });

    if (!tokenExists) {
      throw new Error("Invalid token");
    }
    
    const decodedToken = jwt.verify(token, tokenkey);
    const username = decodedToken.username;

    if (!username) {
      throw new Error("Invalid token");
    }

    const user = await userCollection.findOne(
      { "account.username": username },
      {
        projection: {
          "equipped.hat": 1,
          "equipped.top": 1,
          "equipped.color": 1,
          "equipped.hat_color": 1,
          "equipped.top_color": 1,
          "stats.sp": 1,
          "equipped.gadget": 1,
          "account.nickname": 1,
          "inventory.loadout": 1,
        },
      }
    );

    if (!user) {
      throw new Error("User not found");
    }

    return {
      playerId: user.account.nickname,
      hat: user.equipped.hat,
      top: user.equipped.top,
      player_color: user.equipped.color,
      hat_color: user.equipped.hat_color,
      top_color: user.equipped.top_color,
      skillpoints: user.stats.sp,
      gadget: user.equipped.gadget,
      nickname: user.account.nickname,
      loadout: user.inventory.loadout,
    };

   
  } catch (error) {
    console.error('Error handling request:', error);
    return false;
  }
}

async function increasePlayerDamage(playerId, damage) {
  const username = playerId;
  const damagecount = +damage; 
  
    if (isNaN(damagecount)) {
      return { error: "Invalid damage count provided" };
    }
  
    try {
   
      const incrementResult = await userCollection.updateOne(
        { "account.username": username },
        {
          $inc: { "stats.damage": damagecount },
        }
      );
  
  
          await battlePassCollection.updateOne(
        { username },
        {
          $inc: {
            bonusitem_damage: damagecount,
          },
        },
        {
          upsert: true,
        },
      );
      
  
  } catch (error) {
    console.error("Error updating damage in the database:", error);
  }
}

async function increasePlayerKills(playerId, kills) {
  const username = playerId;
  const killcount = +kills; 

  if (isNaN(killcount)) {
    return { error: "Invalid kill count provided" }; // Assuming we return an object instead of using res
  }

  try {
    // Attempt to increment the player's kill count or insert a new player document if not found
    const incrementResult = await userCollection.updateOne(
      { "account.username": username },
      {
        $inc: { "stats.kills": killcount },
      },
    );

    console.log(JSON.stringify(incrementResult))

    if (incrementResult.modifiedCount > 0 || incrementResult.upsertedCount > 0) {
      // If player's kill count was updated or a new player document was inserted
      const eventKillUpdate = await shopcollection.updateOne(
        { _id: "eventKillsCounter" },
        { $inc: { eventKills: killcount } } // Increment the eventKills by the number of kills
      );

      if (eventKillUpdate.modifiedCount === 0) {
        return { error: "Failed to update event kill counter" };
      }

      return { success: true, message: "Player kills and event counter updated successfully" };
    } else {
      return { error: "User not found or kill count not updated" };
    }
  } catch (error) {
    console.error("Error updating kills in the database:", error);
    return { error: "Database error" };
  }
}

async function increasePlayerWins(playerId, wins2) {
  const username = playerId;
  const wins = +wins2; 

  if (isNaN(wins)) {
    return { error: "Invalid damage count provided" };
  }

  try {

    const incrementResult = await userCollection.updateOne(
      { "account.username": username },
      {
        $inc: { "stats.wins": wins },
      }
    );

  } catch (error) {
    console.error("Error updating damage in the database:", error);
  }
}

async function increasePlayerPlace(playerId, place2, room) {
  const username = playerId;
  const place = +place2; 
  const player = room.players.get(playerId)

  if (isNaN(place) || place < 1 || place > 5 || player.finalrewards_awarded) {
    return;
  }

    player.finalrewards_awarded = true

  try {
    const skillpoints = room.place_counts[place - 1];
    const season_coins = room.ss_counts[place - 1];
    player.skillpoints_inc = skillpoints
    player.seasoncoins_inc = season_coins
    


const updateResult = await userCollection.updateOne(
  { "account.username": username },
  [
    {
      $set: {
        "stats.sp": {
          $max: [0, { $add: ["$stats.sp", skillpoints] }] // Ensure it doesn't go below 0
        }
      }
    }
  ]
);


    await battlePassCollection.updateOne(
      { username },
      {
        $inc: {
          season_coins: season_coins,
        },
      },
      {
        upsert: true,
      },
    );

  } catch (error) {
    console.error("Error updating damage in the database:", JSON.stringify(error));
  }
}

async function checkForMaintenance() {
  let maintenanceMode = false;

  try {
    // Find the maintenanceStatus directly from the document
    const result = await shopcollection.findOne(
      { _id: "maintenance" },
      { projection: { status: 1 } } // Only retrieve the maintenanceStatus field
    );

    if (result.status === "await" || result.status === "true" ) {
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
  increasePlayerDamage,
  increasePlayerKills,
  increasePlayerPlace,
  increasePlayerWins,
  verifyPlayer,
  checkForMaintenance,
};
