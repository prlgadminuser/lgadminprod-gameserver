// src/database/mongoClient.js

const { MongoClient, ServerApiVersion } = require("mongodb");
const { uri, dbName } = require("../../idbconfig");


const mongoClient = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function connectToMongoDB() {
  try {
    await mongoClient.connect();
    console.log("Connected to MongoDB");
  } catch (err) {
    console.error("Error connecting to MongoDB:", err);
    throw err; // Re-throw to be caught in startServer()
  }
}


const db = mongoClient.db(dbName);
const DBuserCollection = db.collection("users");
const DBbattlePassCollection = db.collection("battlepass_users");
const DBshopCollection = db.collection("serverconfig");

module.exports = {
  connectToMongoDB,
  DBuserCollection,
  DBbattlePassCollection,
  DBshopCollection,
};