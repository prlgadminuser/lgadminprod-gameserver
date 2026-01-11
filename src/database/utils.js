const { ObjectId } = require("mongodb");
const { DBuserCollection } = require("./mongoClient");


const userCollection = DBuserCollection

module.exports = {

  getUserIdPrefix(userId) {
    return { _id: new ObjectId(userId) }
  },

  async SaveUserGrantedItems(userId, rewarditems, local_owned_items, session) {
    if (!rewarditems.length) return;

    const baseTimestamp = Date.now();

    const docs = rewarditems.map((id, index) => ({
      userid: userId,
      itemid: id,
      time: baseTimestamp + index,
    }));

    const result = await userItemsCollection.insertMany(docs, {
      session,
    });

    if (result) rewarditems.forEach((item) => local_owned_items.add(item));

    return result;
  },


  async DoesUserIdExist(userId) {
    const userIdExist = await userCollection.findOne(getUserIdPrefix(userId));

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
