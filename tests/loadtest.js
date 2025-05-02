const WebSocket = require('ws');

// Replace with your actual list of JWT tokens
const tokenList = [
  //'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6IkxpcXVlbSIsImlhdCI6MTc0NTcxODQ2OH0.lUrUQFeRS6MBLatKt8lL3LP1nrFHhHqjoDOkHzqBKHE',
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6IlBsYXllcl9YRnJXQ1kiLCJpYXQiOjE3NDU5NDk4NzZ9.JSpreSQpV8VlE9rFYyvGJF2RzPuB76G1tolB0f5Y060",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6IlBsYXllcl9NNXBlSjgiLCJpYXQiOjE3NDU5NTM1MjJ9.ZiZ1f-Hjc-NwvGf53t4Hv1DAnllHEPfJf-FPvTo8NQE",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6IlBsYXllcl81RVJGWEMiLCJpYXQiOjE3NDU5NzA1ODF9.PnDGfsV0bMUGMrpMyDkeHu8UC-pI2vn_Z5aPnaLbXhA",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6IlBsYXllcl9GVDdaaG0iLCJpYXQiOjE3NDU5NzM5NzR9.4uRklZIDRwLmBD6MRgtbmK1d3NMRDLdPHoQ52EtHhTU",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6IlBsYXllcl83TUVqcE4iLCJpYXQiOjE3NDYxMjY0MDV9.HdYQwDGEYbyN_7Cb-PmeyC9iUYnqpPHhpuxRscXfPgQ",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6Iml0aXR6aXQiLCJpYXQiOjE3NDYxMjY0MTZ9.o8TcC9PuLmURNn0Zj3JDZa-IBLoP3IRYCE5TeX9RlAs",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6InJocnpleiIsImlhdCI6MTc0NjE5MjczNn0.RQJANoAskWX8TGskTaKnn5nhi77J3jybv8dMkgJ1twg",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6IlBsYXllcl9IVGVzNEIiLCJpYXQiOjE3NDU4Nzk1NjZ9.SAdlztMXkMTAI0DUstj860L5YOHo7knmF7jEF8JWFJg"
  
  // ...
];

const serverBase = 'wss://s1-eu-sdgame.onrender.com/';

function startClient(token) {
  const wsUrl = `${serverBase}${token}/breakthrough`;

  const ws = new WebSocket(wsUrl, {
    headers: {
      Origin: 'https://skilldown.netlify.app',
    },
  });

  ws.on('open', () => {
    console.log(`✅ Connected: ${token}`);
    setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send('1');
       // console.log(`📤 Sent "1" from ${token}`);
      }
    }, 3000);
  });

  ws.on('message', (data) => {
  //  console.log(`📥 Message from server to ${token}:`, data.toString());
  });

  ws.on('error', (err) => {
    console.error(`❌ Error with ${token}:`, err.message);
  });

  ws.on('close', () => {
    console.log(`🔌 Disconnected: ${token}`);
  });
}

// Start all clients
tokenList.forEach(token => {
  startClient(token);
});
