// server.js
require('dotenv').config(); // Load secrets from .env
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

// 1. Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ CRITICAL ERROR: Missing Supabase URL or Key in .env file");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// 2. Setup Express & Socket.io
const app = express();
app.use(cors());
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173", // Make sure this matches your Frontend port!
    methods: ["GET", "POST"]
  }
});

io.on('connection', async (socket) => {
  console.log('👤 New user connected:', socket.id);

  // --- A. FETCH HISTORY ON CONNECT ---
  // Get the last 100 gratitudes to populate the map
  const { data: history, error } = await supabase.rpc('get_gratitudes');

  if (error) {
    console.error("⚠️ Database Read Error:", error.message);
  } else {
    // Now history comes back perfectly formatted!
    // No need for that complex .map() logic anymore.
    console.log("✅ Loaded history:", history.length, "items");
    socket.emit('initial_data', history);
  }

  // --- B. HANDLE NEW SUBMISSIONS ---
  socket.on('submit_gratitude', async (incomingData) => {

    if (!incomingData || typeof incomingData.message !== 'string' || typeof incomingData.lat !== 'number', typeof incomingData.lng !== 'number') {
       return;
    }

    const ip = socket.handshake.address;
    const lastPostTime = rateLimitMap.get(ip) || 0;
    const now = Date.now();

    if (now - lastPostTime < 10000) { // Limit: 1 post every 10 seconds per IP
       socket.emit('error_msg', "You are being too grateful! Please wait 10 seconds.");
       return;
    }
    rateLimitMap.set(ip, now); // Update time

    const cleanMessage = incomingData.message.substring(0, 280); 


    const { data: savedRow, error: insertError } = await supabase
      .from('gratitudes')
      .insert({
        message: cleanMessage, // Use the clean version
        location: `POINT(${incomingData.lng} ${incomingData.lat})` 
      })
      .select()
      .single();

    if (insertError) {
      console.error("❌ Database Write Error:", insertError.message);
      return; 
    }

    // 2. Broadcast to all users
    // We send back exactly what the frontend needs
    if (savedRow) {
      // 🛡️ OBFUSCATION: Add random jitter to the LIVE blink
      // 0.1 degrees is roughly 11km. We subtract 0.05 to center the jitter.
      const fuzzFactor = 0.1; 
      const fuzzedLat = incomingData.lat + (Math.random() * fuzzFactor) - (fuzzFactor / 2);
      const fuzzedLng = incomingData.lng + (Math.random() * fuzzFactor) - (fuzzFactor / 2);

      const broadcastData = {
        id: savedRow.id,
        message: savedRow.message,
        lat: fuzzedLat,
        lng: fuzzedLng,
        tempId: incomingData.tempId 
      };
      
      io.emit('new_blink', broadcastData);
    }
  });

  socket.on('disconnect', () => {
    console.log('👋 User disconnected');
  });
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`✅ SERVER RUNNING on port ${PORT}`);
  console.log(`🔗 Connected to Supabase: ${supabaseUrl}`);
});