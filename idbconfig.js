


const { MONGO_URI, TOKEN_KEY, DISCORDWEBHOOK, REDIS_KEY } = require("./ENV")

const lgconnecturi = process.env.MONGO_URI || MONGO_URI
const tokenkey = process.env.TOKEN_KEY || TOKEN_KEY
const webhookURL = process.env.DISCORDWEBHOOK || DISCORDWEBHOOK
const rediskey = process.env.REDIS_KEY || REDIS_KEY



const uri = lgconnecturi

module.exports = {
   uri,
   tokenkey,
   rediskey,
}