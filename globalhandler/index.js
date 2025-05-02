"use strict";

const testmode = false

const WebSocket = require("ws");
const http = require('http');
const axios = require("axios");
const { MongoClient, ServerApiVersion } = require("mongodb");
const jwt = require("jsonwebtoken");
const LZString = require("lz-string");
const { RateLimiterMemory } = require("rate-limiter-flexible");
const osu = require('node-os-utils');

const cpu = osu.cpu;
const mem = osu.mem;


// Function to log the server's RAM and CPU usage
async function logServerUsage() {
  const cpuUsage = await cpu.usage();
  const memoryInfo = await mem.info();

  console.log('CPU Usage:', cpuUsage + '%');
  console.log('Memory Usage:', memoryInfo.usedMemMb + ' MB used of ' + memoryInfo.totalMemMb + ' MB');
  console.log('Memory Usage:', memoryInfo.usedMemPercentage + '%');
}

// Log server usage every 5 seconds
//setInterval(logServerUsage, 60000);


const ConnectionOptionsRateLimit = {
  points: 1, // Number of points
  duration: 1, // Per second
};

let connectedClientsCount = 0;
let connectedUsernames = [];



const rateLimiterConnection = new RateLimiterMemory(ConnectionOptionsRateLimit);

const server = http.createServer((req, res) => {
  // Set security headers
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'interest-cohort=()');

  // Handle request and send a response
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('qs\n');
});


const wss = new WebSocket.Server({
  noServer: true,
  clientTracking: false, 
  perMessageDeflate: {
    zlibDeflateOptions: {
      chunkSize: 1024,
      memLevel: 7,
      level: 3,
    },
    zlibInflateOptions: {
      chunkSize: 10 * 1024,
    },
    clientNoContextTakeover: true,
    serverNoContextTakeover: true,
    serverMaxWindowBits: 10,
    concurrencyLimit: 10,
    threshold: 1024,
  },
  //perMessageDeflate: true,
  proxy: true,
  maxPayload: 20,
  //maxPayload: 10 * 1024 * 1024 
});




const Limiter = require("limiter").RateLimiter;


const password = process.env.DB_KEY || "8RLj5Vr3F6DRBAYc"
const encodedPassword = encodeURIComponent(password);

const uri = `mongodb+srv://Liquem:${encodedPassword}@cluster0.ed4zami.mongodb.net/?retryWrites=true&w=majority`;
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
    socketTimeoutMS: 30000,
 //   maxConnecting: 2,
   // maxIdleTimeMS: 300000,
   // maxPoolSize: 100,
    //minPoolSize: 0,
  },
});

async function startServer() {
  try {
  
    await client.connect();
    console.log("Connected to MongoDB");

  } catch (err) {
    console.error("Error connecting to MongoDB:", err);
  }
}

if (!testmode) {
startServer();
}

const db = client.db("Cluster0");
const userCollection = db.collection("users");
const battlePassCollection = db.collection("battlepass_users");
const shopcollection = db.collection("serverconfig");

module.exports = {
  LZString,
  axios,
  Limiter,
  WebSocket,
  http,
  connectedClientsCount,
  MongoClient, 
  ServerApiVersion,
  db,
  userCollection,
  battlePassCollection,
  shopcollection,
  jwt,
};


const {
  joinRoom,
  handleRequest,
} = require("./room");

const {
  closeRoom,
} = require("./roomhandler/manager");


const {
  increasePlayerDamage,
  increasePlayerKills,
  increasePlayerPlace,
  increasePlayerWins,
  verifyPlayer,
  checkForMaintenance,
} = require("./dbrequests");

const { game_win_rest_time, maxClients, all_gamemodes, gamemodeconfig } = require("./config");

const { rooms } = require('./../roomhandler/manager')



function endGame(room) {

  if (room) {
  room.players.forEach((player) => {

    if (room.eliminatedPlayers) {
      player.ws.close(4300, "places");
    } else {
      player.ws.close(4301, "game_ended");
   
    }
  
  });
}
}





const allowedOrigins = [
  "https://slcount.netlify.app",
  "https://slgame.netlify.app",
  "https://serve.gamejolt.net",
  "http://serve.gamejolt.net",
  "tw-editor://.",
  "https://html-classic.itch.zone",
  "null",
  "https://turbowarp.org",
    "https://liquemgames.itch.io/sr",
  "https://s-r.netlify.app",
  "https://uploads.ungrounded.net",
  "https://prod-dpgames.crazygames.com",
  "https://crazygames.com",
  "https://crazygames.com/game/skilled-royale",
     "https://s-ri0p-delgae.netlify.app",
];

function isValidOrigin(origin) {
  const trimmedOrigin = origin.trim().replace(/(^,)|(,$)/g, "");
  return allowedOrigins.includes(trimmedOrigin);
}

function isvalidmode(gmd) {
  return all_gamemodes.includes(gmd);
}


async function handlePlayerVerification(token) {
  const playerVerified = await verifyPlayer(token);
  if (!playerVerified) {
    return false;  // Optional: To indicate verification failure
  }
  return playerVerified;  // Optional: To indicate successful verification
}

wss.on("connection", (ws, req) => {
    try {
        // Check for maintenance mode
          checkForMaintenance()
        .then(isMaintenance => {
            if (isMaintenance) {
                ws.close(4008, "maintenance");
                return;
            }


        // Check for maximum clients limit
        if (connectedClientsCount > maxClients) {
            ws.close(4034, "code:full");
            return;
        }

        // Parse URL and headers
        const [_, token, gamemode] = req.url.split('/');
        const origin = req.headers["sec-websocket-origin"] || req.headers.origin;

        // Validate request
        if (req.length > 2000 || (origin && origin.length > 50) || !isValidOrigin(origin)) {
            ws.close(4004, "Unauthorized");
            return;
        }

          if (!(token && token.length < 300 && gamemode in gamemodeconfig)) {
            ws.close(4094, "Unauthorized");
        //    console.log("Invalid token or gamemode");
            return;
        }

        // Verify player token
        handlePlayerVerification(token).then(playerVerified => {
            if (!playerVerified) {
                ws.close(4001, "Invalid token");
                return;
            }

            if (connectedUsernames.includes(playerVerified.playerId)) {
                ws.close(4006, "code:double");
                return;
            }

            // Join room and handle connection
            joinRoom(ws, token, gamemode, playerVerified).then(result => {
                if (!result) {
                    ws.close(4001, "Invalid token");
                    return;
                }

                connectedClientsCount++;
                connectedUsernames.push(result.playerId);
              //  console.log(connectedUsernames);

             ws.on("message", (message) => {

 
    const compressedBinary = message.toString("utf-8"); // Convert Buffer to string


                    try {
                        const parsedMessage = compressedBinary;
                        const player = result.room.players.get(result.playerId);

                        if (player && compressedBinary.length < 200 && player.rateLimiter.tryRemoveTokens(1)) {
                            handleRequest(result, parsedMessage);
                        }
                    } catch (error) {
                        console.error("Failed to parse JSON:", error.message);
                    }
                  
                });


 /*            ws.on("message", (message) => {
         // const sanitizedMessage = sanitize(message);
         const player = result.room.players.get(result.playerId);
          if (result.room.players.has(result.playerId) && message.length < 200 && player.rateLimiter.tryRemoveTokens(1)) {    
              handleRequest(result, message);


            
          } else {

            console.log("Player not found in the room.");
            player.ws.close(4004, "Unauthorized");
          }
        });
*/
          

                ws.on('close', (code, reason) => {
                    const player = result.room.players.get(result.playerId);
                    if (player) {
                        clearInterval(player.moveInterval);
                        if (player.timeout) clearTimeout(player.timeout);

                        if (player.damage > 0) increasePlayerDamage(player.playerId, player.damage);
                        if (player.kills > 0) increasePlayerKills(player.playerId, player.kills);

                        connectedClientsCount--;
                        connectedUsernames = connectedUsernames.filter(username => username !== player.playerId);
                        result.room.players.delete(result.playerId);

                        if (result.room.players.size < 1) {
                            closeRoom(result.roomId);
                           // console.log('Room closed');
                            return;
                        }

                        if (result.room.state === "playing" && result.room.winner === 0) {
                            let remainingPlayers = Array.from(result.room.players.values()).filter(player => !player.eliminated);

                            if (remainingPlayers.length === 1) {
                                const winner = remainingPlayers[0];
                                result.room.winner = winner.playerId;

                                increasePlayerWins(winner.playerId, 1);
                                increasePlayerPlace(winner.playerId, 1, result.room);
                                result.room.eliminatedPlayers.push({ username: winner.playerId, place: 1 });

                                result.room.timeoutIds.push(setTimeout(() => endGame(result.room), game_win_rest_time));
                          }
                           
                        }
                        
                    }
                   
            
                })
                });
            }).catch(err => {
                console.error("Error joining room:", err);
                ws.close(1011, "Internal server error");
            });
        }).catch(err => {
            console.error("Error verifying player:", err);
            ws.close(1011, "Internal server error");
        });
    } catch (error) {
        console.error("Error during WebSocket connection handling:", error);
        ws.close(1011, "Internal server error");
    }
});
    
    
 

     server.on("upgrade", (request, socket, head) => {
      const ip = request.socket["true-client-ip"] || request.socket["x-forwarded-for"] || request.socket.remoteAddress;
    
      rateLimiterConnection.consume(ip)
        .then(() => {
          const origin = request.headers["sec-websocket-origin"] || request.headers.origin;
    
          if (!isValidOrigin(origin)) {
            socket.destroy();
            return;
          }
    
          if (connectedClientsCount < maxClients) {
            wss.handleUpgrade(request, socket, head, (ws) => {
              wss.emit("connection", ws, request);
            });
          } else {
            
            socket.destroy();
          }
        })
        .catch(() => {
          socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n');
          socket.destroy();
        });
    });
    
    process.on("uncaughtException", (error) => {
      console.error("Uncaught Exception:", error);
    });
    
    process.on("unhandledRejection", (reason, promise) => {
      console.error("Unhandled Rejection:", reason, promise);
    });
    

    const PORT = process.env.PORT || 3090;
    server.listen(PORT, () => {
      console.log(`Server is listening on port ${PORT}`);
    });
