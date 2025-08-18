
// THIS IS ONLY FOR LOCAL DEV - NEVER ON THE ACTUAL SERVER WHERE ENV IS USED
const MONGO_URI = "mongodb+srv://sr-server-user:I8u8a8iOBNkunxRK@cluster0.ed4zami.mongodb.net/?retryWrites=true&w=majority"
const TOKEN_KEY = "d8ce40604d359eeb9f2bff31beca4b4b"
const DISCORDWEBHOOK = "https://discord.com/api/webhooks/1377681070954385428/hTt9-Df2c7YnYCRMVWGhbQi5buH_wRtiUvBdJbtB6xknNBpbxtJxgGYnRdFuMawX4CqV"
const DB_NAME = "Cluster0"
const REDIS_KEY = 'rediss://default:ATBeAAIncDE4ZGNmMDlhNGM0MTI0YTljODU4YzhhZTg3NmFjMzk3YnAxMTIzODI@talented-dassie-12382.upstash.io:6379'

module.exports = { MONGO_URI, TOKEN_KEY, DISCORDWEBHOOK, DB_NAME, REDIS_KEY }