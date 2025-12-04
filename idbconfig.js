



const lgconnecturi = process.env.MONGO_URI
const tokenkey = process.env.TOKEN_KEY
const webhookURL = process.env.DISCORDWEBHOOK
const rediskey = process.env.REDIS_KEY



const uri = lgconnecturi

module.exports = {
   uri,
   tokenkey,
   rediskey,
}