const WebSocket = require('ws');

const tokenList = [
"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6IkxpcXVlIiwiaWF0IjoxNzUxNDc5NjM4fQ.w003DXFThvcPfz6N6U9YyizCpQad3TYAc4r3GyXj3Tc",
"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6ImhsaGxobGgiLCJpYXQiOjE3NTE2MTUyMzJ9.dAzQRAshvg4qMevIYDkOAUbh2NQp4UmRuDBzztLlRiQ",
"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6ImpqaWpvaWppaiIsImlhdCI6MTc1MTcxMjE4NX0.uN1cdBzEE9QYt_s7eWiC9RmbnZSBpxSVI60Ze68vNnw",
"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6ImdhZ2FnZSIsImlhdCI6MTc1MTcxNDkxMX0.UdKVvsJsngvOEfh-9X3LtzQ4EdbE9-v_Kas06Isg9I8",
"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6IlBsYXllcl9oZGJZWXciLCJpYXQiOjE3NTE3MzQzNDZ9.vCiYS309aWJYsyvOA9hV2vgWprdL3qhab8rTMjtogWw",
"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6ImpkamRqZCIsImlhdCI6MTc1MTgwMjU4OX0.yRYX8ocdcNPBg_ORO0nwmvRnk2Z6w4scVqDbnBbM6KI",
"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6ImZhZ2VnZSIsImlhdCI6MTc1MTgxNTY4Nn0.jhZVeDlZqK9l8xI3zYXKNqCLhQn3amA6NKp0ajhNQ_o",
"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6InRzdGV0IiwiaWF0IjoxNzUxODE5MDI4fQ.Iune-0tr7-ha2MP6XNrHsWaxptEJYeVSgXumdBhwaU0",
"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6IlBsYXllcl9DcDJQZkYiLCJpYXQiOjE3NTE4MTkyMzJ9.gDdaN_NyCdgw7T5swxPCv4Bc9A136rCOk13YE03tRqk",
"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6IlBsYXllcl9QQzQ1Rm0iLCJpYXQiOjE3NTE4MjA2NTZ9.siqL2S5Vq5V8FfNR15ONXTaWeIGUmgCigKzBVEDhB1I"
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
  const wsUrl = `${serverBase}${token}/fightdown`;

  const ws = new WebSocket(wsUrl, {
    headers: { Origin: 'https://skilldown.netlify.app' },
  });

  ws.on('open', () => {
    console.log(`✅ Connected: ${token}`);

     setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send("1");
        // console.log(`📤 Sent from ${token}: ${cmd}`);
      }
    }, 2000);

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
