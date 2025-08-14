const WebSocket = require('ws');

const tokenList = [
  // Your tokens...
];

const serverBase = 'wss://s1-eu-sdgame.onrender.com/';

function randomCommand() {
  const commandTypes = ['move', 'stop', 'shoot', 'changeWeapon'];
  
  const type = commandTypes[Math.floor(Math.random() * commandTypes.length)];

  switch (type) {
    case 'move':
      // 8 possible movement directions
      const directions = [-180, -135, -90, -45, 0, 45, 90, 135, 180];
      const dir = directions[Math.floor(Math.random() * directions.length)];
      return `3:${dir}:1`; // move command
    case 'stop':
      return '2'; // stop movement
    case 'shoot':
      // shooting angle -180 to 180
      const shootDir = Math.floor(Math.random() * 361) - 180;
      return `4:${shootDir}`;
    case 'changeWeapon':
      const weaponId = Math.floor(Math.random() * 5); // example: 5 weapons
      return `5:${weaponId}`;
  }
}


function startClient(token) {
  const wsUrl = `${serverBase}${token}/breakthrough`;

  const ws = new WebSocket(wsUrl, {
    headers: { Origin: 'https://skilldown.netlify.app' },
  });

  ws.on('open', () => {
    console.log(`✅ Connected: ${token}`);

    // Send 10 random commands per second (every 100ms)
    setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        const cmd = randomCommand();
        ws.send(cmd);
        // console.log(`📤 Sent from ${token}: ${cmd}`);
      }
    }, 100);
  });

  ws.on('message', (data) => {
    let message = data.toString();
    if (message.includes("rwds")) {
      console.log(`📥 Message from server to ${token}:`, message);
    }
  });

  ws.on('error', (err) => {
    console.error(`❌ Error with ${token}:`, err.message);
  });

  ws.on('close', () => {
    console.log(`🔌 Disconnected: ${token}`);
  });
}

const limit = 8; // number of simulated clients

for (let i = 0; i < Math.min(limit, tokenList.length); i++) {
  startClient(tokenList[i]);
}
