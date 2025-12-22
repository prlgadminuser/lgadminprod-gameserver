const WebSocket = require('ws');

const limit = 57; // number of simulated clients

const gamemode = "fightdown"

const serverBase = 'wss://s1-eu-sdgame.onrender.com/';

const tokenList = [
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6ImRnc2dkZyIsImlhdCI6MTc1NTM5NDg4NH0.whO7oBdbeJP-3OaqwfvuUn-xvzlCRT9M0wWRlWQyd18",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6ImhsaGxobGgiLCJpYXQiOjE3NTE2MTUyMzJ9.dAzQRAshvg4qMevIYDkOAUbh2NQp4UmRuDBzztLlRiQ",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6ImpqaWpvaWppaiIsImlhdCI6MTc1MTcxMjE4NX0.uN1cdBzEE9QYt_s7eWiC9RmbnZSBpxSVI60Ze68vNnw",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6ImdhZ2FnZSIsImlhdCI6MTc1MTcxNDkxMX0.UdKVvsJsngvOEfh-9X3LtzQ4EdbE9-v_Kas06Isg9I8",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6IlBsYXllcl9oZGJZWXciLCJpYXQiOjE3NTE3MzQzNDZ9.vCiYS309aWJYsyvOA9hV2vgWprdL3qhab8rTMjtogWw",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6ImpkamRqZCIsImlhdCI6MTc1MTgwMjU4OX0.yRYX8ocdcNPBg_ORO0nwmvRnk2Z6w4scVqDbnBbM6KI",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6ImZhZ2VnZSIsImlhdCI6MTc1MTgxNTY4Nn0.jhZVeDlZqK9l8xI3zYXKNqCLhQn3amA6NKp0ajhNQ_o",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6InRzdGV0IiwiaWF0IjoxNzUxODE5MDI4fQ.Iune-0tr7-ha2MP6XNrHsWaxptEJYeVSgXumdBhwaU0",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6IlBsYXllcl9DcDJQZkYiLCJpYXQiOjE3NTE4MTkyMzJ9.gDdaN_NyCdgw7T5swxPCv4Bc9A136rCOk13YE03tRqk",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6IlBsYXllcl9QQzQ1Rm0iLCJpYXQiOjE3NTE4MjA2NTZ9.siqL2S5Vq5V8FfNR15ONXTaWeIGUmgCigKzBVEDhB1I",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6IlBsYXllcl9mYlh6OHgiLCJpYXQiOjE3NTE5MDY4ODJ9.xYVBNVebBoFnJRnGIBO73eVPX77rC1FI8iGMqGjZLUo",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6IlBsYXllcl81TnM0YjgiLCJpYXQiOjE3NTE5MDk2NTV9.6A64QBDZi8oFZotVX058jSv-RegQbKiCh-aUgpxemjQ",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6IlBsYXllcl9DdDNNV0MiLCJpYXQiOjE3NTE5MTEyMDB9.avS74lCbFNkQYDfDNCKR4Bmb59Et-p89wwESVRQZozk",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6IlBsYXllcl9aOFFRRzMiLCJpYXQiOjE3NTE5NzI3MjR9.lzxeNKG8XtX6SPwvotmbQ3z4Cgf7IUAHh4JUpyPR798",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6IlBsYXllcl82YUoyMloiLCJpYXQiOjE3NTE5ODQ1ODJ9.sqTN2ulfWLCqpdscWP2nS7HikLSMVn5QZlC4uvmI0zQ",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6IlBsYXllcl90S2tDU3kiLCJpYXQiOjE3NTE5ODQ3MjR9.EeWGLLj2e6kko09tuNq8pP7P0UJdQtv-Qd8Z8MMIrgE",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6IlBsYXllcl9iUEtSUWMiLCJpYXQiOjE3NTIyMzMwNDB9.C4h0ZDjBxmw93oSM6pLT-GaVj2GfXrowdcrFS8-ju64",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6IlBsYXllcl94OGl3aHkiLCJpYXQiOjE3NTIyMzUzMDl9.TZvDrfnQC6ZV-cEgqL9vQqsi-rAWj5BMJtv-0IJ3OL4",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6IlBsYXllcl9OZU5DbmEiLCJpYXQiOjE3NTIyMzcyMDh9.MUBDdJUJeTM8TNg57Sjbxt23zX17qBhfc2whVf5XxXM",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6ImxsbGxsbGxsbGxsbGxsbGwiLCJpYXQiOjE3NTI1OTAzODN9.z2h0leciBjYITtyhfjSqco-2RbGZLUsuSHfMN4ei_lQ",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6IlBsYXllcl9adFFNYTMiLCJpYXQiOjE3NTI2NzcxNzV9.zKyKCPo-K8mFN1ysT50o3F3-X4YTSvsyyS5lLdFlhD4",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6ImFmc2ZhZiIsImlhdCI6MTc1MzEzNDYyMn0.kgUkfRfb40blU7l5Scte16kNesrToEJJ-m9vp2COURE",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6IlBsYXllcl9COEo4MmMiLCJpYXQiOjE3NTQxMDI2NDF9.CJJGNzLAObxGCPN-a7WqvABGYzapDUY6gM2KAW7kmSk",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6Ikpva2VyR2FtZXIzNDEiLCJpYXQiOjE3NTQxODMzMzh9.LzdESh3pMN3ZdPGqH0uJxeJEhV8_FQtIqjPTep3dmB8",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6ImdkZzkwIiwiaWF0IjoxNzU0MjQwNjcwfQ.xiWIyrCOY1GmgwuTQ-nrrAczTpl7XcKm0ATJk2B_TSo",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6IlBsYXllcl9rSkpHSGkiLCJpYXQiOjE3NTQyNDI3MzZ9.LFm8Miutm8u7wlrqktYjBr17fHzExOQG8NqGrFHvi3I",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6IlBsYXllcl9KenhSOGkiLCJpYXQiOjE3NTQyNDkzOTN9.73XMfhW3fzoM1MoLM7x1ZfRp9FUzvAIH-bKdLexf_XE",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6IlBsYXllcl80aDJNYU0iLCJpYXQiOjE3NTQyNTEzNTB9.LKBKL5h7df1OapCtL_wf-X1Kf0LUtmyqKAXmjt5gae4",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6IlBsYXllcl9pVDN5YTYiLCJpYXQiOjE3NTQzMzg3Nzd9.ME8a7ZEyUQqFBFNMK5RDcy8pFCF3nNftnVO4tkSylvs",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6IlBsYXllcl90ZHhCWEoiLCJpYXQiOjE3NTQzMzk5MTl9.VJ5nnKrdSy9Rw7ArburUVb-5JLx8WEfX65oMWrX99CQ",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6IlBsYXllcl9mendqZlkiLCJpYXQiOjE3NTQzNDMyMjF9.l_z1fkM0LBJCk9Dlty8re4_68deNAJtHsjvQSClAav8",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6IlBsYXllcl9SRUNhUFMiLCJpYXQiOjE3NTQ2OTkyOTN9.2ymuxKdz1TvmBoPQ7MPEcVNkPlgqG87oImadNpts8W8",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6IlBsYXllcl9aYjRpUGsiLCJpYXQiOjE3NTQ3MDEzNTB9.MfcU-lmS9Vw2a192cSq_qQVgfxbOO4P39lpA5c7kdt8",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6IlBsYXllcl9CU2EyM0MiLCJpYXQiOjE3NTQ3MTMzNTd9.LOCrfM4uRQWUKl3ADyaSLwEkeV2L46MsC2tYwr7u00g",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6IlBsYXllcl94TXJNZnciLCJpYXQiOjE3NTQ3NjUxNTB9.3MLt8HfLQVFU8pZcmcCNqBVLLq-qp7swE7b8DRySMEg",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6IlBsYXllcl84UEtHRWYiLCJpYXQiOjE3NTQ3NjU1ODN9.J3NkXjq7puiTDtZIcDZ03TH0dmfDalumrkuXY6wgPFE",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6IlBsYXllcl9RYkNhOGsiLCJpYXQiOjE3NTQ3NjkyNDJ9.xXy03Q2lW_WipfeuEAqO3AO5oE2rvAdIZI1cQHKn4I8",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6InpqenV0dXRydWkiLCJpYXQiOjE3NTQ3NzgyMjV9.KK52hPE24CYet0PpKBINRi5SNQlZzjU84t10tNeGPwc",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6InR1aXRpdHVpIiwiaWF0IjoxNzU0Nzc4MjUxfQ.IjeBNr-nYwAd-GC_EGIWZiXGmG83Ii6ezXPvNwQwSeg",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6IlBsYXllcl8yYXpGTXgiLCJpYXQiOjE3NTQ3ODU2ODJ9.2SGIfnu0GLGuqm2mt8kwHHF38LWLRRSf32hRZlKZRvo"

];
console.log(tokenList.length)


function randomCommand() {
  const commandTypes = [
    'move',
    'stop', 
    "emote", 
    //"shoot", 
    'changeWeapon'];

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

    case 'emote':
      const num = Math.floor(Math.random() * 4) + 1;
     return `6:${num}`;
  }
}


function startClient(token) {
  const wsUrl = `${serverBase}${token}/${gamemode}`;

  const ws = new WebSocket(wsUrl, {
    headers: { Origin: 'https://skilldown.netlify.app' },
  });

  ws.on('open', () => {
    console.log(`✅ Connected: ${token}`);

    const heartbeat = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send("1");
        // console.log(`📤 Sent from ${token}: ${cmd}`);
      }
    }, 2000);

    // Send 10 random commands per second (every 100ms)
     const commandInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        const cmd = randomCommand();
        ws.send(cmd);
        // console.log(`📤 Sent from ${token}: ${cmd}`);
      }
    }, 100);

       ws.on('close', () => {
      clearInterval(heartbeat);
      clearInterval(commandInterval);
    });
  });

  ws.on('message', (data) => {
    let message = data.toString();
    if (message.includes("rwds")) {
     // console.log(`📥 Message from server to ${token}:`, message);
    }
  });

  ws.on('error', (err) => {
    console.error(`❌ Error with ${token}:`, err.message);
  });

  ws.on('close', () => {
    console.log(`🔌 Disconnected: ${token}`);
  });
}


for (let i = 0; i < Math.min(limit, tokenList.length); i++) {
  startClient(tokenList[i]);
}
