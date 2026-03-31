const { ObjectId } = require("mongodb");
const { DBuserCollection } = require("./mongoClient");



const userCollection = DBuserCollection

module.exports = {

  getUserIdPrefix(userId) {
    return { _id: new ObjectId(userId) }
  },

  async DoesUserIdExist(userId) {
    const userIdExist = await userCollection.findOne(this.getUserIdPrefix(userId));

    return userIdExist;
  },

  async DoesUserNameExist(nameToCheck) {
    const nameExists = await userCollection.findOne(
      { "account.nickname": nameToCheck },
      {
        collation: { locale: "en", strength: 2 },
        hint: "account.username_1",
      }
    );

    return nameExists;
  },
};
