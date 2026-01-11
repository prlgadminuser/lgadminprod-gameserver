
const TOKEN_KEY = process.env.TOKEN_KEY
const jwt = require("jsonwebtoken");
const { DBuserCollection } = require("./mongoClient");
const { getUserIdPrefix } = require("./utils");

async function verifyPlayer(token) {

  if (!token) {
    throw new Error("Unauthorized");
  }

  try {

    const decodedToken = jwt.verify(token, TOKEN_KEY);
    const userId = decodedToken

    if (!username) {
      throw new Error("Invalid token");
    }

    const BanData = await DBuserCollection.findOne(
      getUserIdPrefix(userId),
      {
        projection: {
          "_id": 0,
          "account.ban_data.until": 1,
        },
      }
    );

     if (!BanData) {
      throw new Error("Invalid token or user not found");
    }

    const bannedUntil = BanData.account.ban_data.until
    const time = Date.now()
    if (time < bannedUntil) throw new Error("user is disabled");


     const user = await DBuserCollection.findOne(
      getUserIdPrefix(userId),
      {
        projection: {
          "account.username": 1,
          "account.nickname": 1,
          "equipped.hat": 1,
          "equipped.top": 1,
          "equipped.color": 1,
          "equipped.hat_color": 1,
          "equipped.top_color": 1,
          "stats.sp": 1,
          "inventory.loadout": 1,
        },
      }
    );

    if (!user || user._id !== userId) {
      throw new Error("Invalid token or user not found");
    }

    if (!user) {
      throw new Error("User not found");
    }

    return {
      userId: user._id,
      playername: username,
      hat: user.equipped.hat,
      top: user.equipped.top,
      player_color: user.equipped.color,
      hat_color: user.equipped.hat_color,
      top_color: user.equipped.top_color,
      skillpoints: user.stats.sp,
      loadout: user.inventory.loadout,
      gadget: user.inventory.loadout.gadget
    };

  } catch (error) {
   // console.error('Error handling request:', error);
    return false;
  }
}

module.exports = { verifyPlayer }