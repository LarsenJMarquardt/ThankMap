// server.js
import 'dotenv/config'; // Loads variables immediately
import express from 'express';
import { createServer } from 'http'; // 'http' is a named export in Node
import { Server } from 'socket.io';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import xss from 'xss';
import { nanoid } from 'nanoid'; // Now works with the latest version!

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
const server = createServer(app);
const rateLimitMap = new Map();
const TARGET_DOTS_PER_VIEW = 100;
const EARTH_RADIUS_KM = 6371;
const SCRAMBLE_RADIUS_KM = 20;

const normalizeLongitude = (lng) => {
  return ((lng + 540) % 360) - 180;
};

const scrambleCoordinates = (lat, lng, radiusKm = SCRAMBLE_RADIUS_KM) => {
  const distanceKm = Math.sqrt(Math.random()) * radiusKm;
  const angularDistance = distanceKm / EARTH_RADIUS_KM;
  const bearing = Math.random() * Math.PI * 2;

  const latRad = (lat * Math.PI) / 180;
  const lngRad = (lng * Math.PI) / 180;

  const scrambledLatRad = Math.asin(
    Math.sin(latRad) * Math.cos(angularDistance) +
      Math.cos(latRad) * Math.sin(angularDistance) * Math.cos(bearing)
  );

  const scrambledLngRad =
    lngRad +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latRad),
      Math.cos(angularDistance) - Math.sin(latRad) * Math.sin(scrambledLatRad)
    );

  return {
    lat: (scrambledLatRad * 180) / Math.PI,
    lng: normalizeLongitude((scrambledLngRad * 180) / Math.PI)
  };
};

const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:5173",       // Your local dev environment (Vite default)
      "http://localhost:3000",       // Your specific local port (if you use 5137)
      "https://thankmap.vercel.app", // The Vercel deployment
      "https://thankmap.com",        // Your production domain
      "https://www.thankmap.com"     // Your production www
    ],
    methods: ["GET", "POST"]
  }
});

io.on('connection', async (socket) => {
  console.log('👤 New user connected:', socket.id);

  // --- A. FETCH HISTORY ON CONNECT ---
  // Get the last 100 gratitudes to populate the map
  console.log("🔍 Attempting to load history from Supabase...");
  const { data: history, error } = await supabase.rpc('get_gratitudes');

  if (error) {
    console.error("⚠️ Database Read Error:", error.message);
  } else {
    if (history.length === 0) {
        console.log("⚠️ WARNING: 0 rows returned.");
        console.log("   Possible Cause 1: The table is actually empty.");
        console.log("   Possible Cause 2: RLS (Row Level Security) is on, but no Policy allows 'SELECT'.");
    } else {
        console.log("   Sample item:", history[0]); // Print one to verify structure
        // Store in memory if that's how your app works
        // existingGratitudes = data; 
    }
    socket.emit('initial_data', history);
  }

  socket.on('map_bounds', async (bounds) => {
    // 1. Validate inputs to prevent crashing
    if (!bounds || typeof bounds.north !== 'number' || typeof bounds.west !== 'number') {
      return; 
    }

    console.log(`🗺️ Fetching dots for view: [${bounds.west}, ${bounds.south}] to [${bounds.east}, ${bounds.north}]`);

    // 2. Call the RPC function we created in SQL
    const { data: localGratitudes, error } = await supabase.rpc('get_gratitudes_in_view', { 
      min_lat: bounds.south, 
      min_lng: bounds.west, 
      max_lat: bounds.north, 
      max_lng: bounds.east 
    });

    if (error) {
      console.error("⚠️ Error fetching view dots:", error.message);
    }
    // 3. Keep payload near 100 dots to match map density targets.
    const boundedDots = Array.isArray(localGratitudes)
      ? localGratitudes.slice(0, TARGET_DOTS_PER_VIEW)
      : [];

    socket.emit('update_map_dots', boundedDots);
  });

  // Backend route to fetch single gratitude by code
app.get('/share/:code', async (req, res) => {
    const { code } = req.params;
    
    // USE RPC instead of .select('*') to get clean lat/lng
    const { data, error } = await supabase
        .rpc('get_shared_gratitude', { lookup_code: code });

    if (data && data.length > 0) {
        // RPC returns an array, so we take the first item
        const record = data[0];
        
        // Ensure we send a variant (default to 0 since DB doesn't store it)
        const responseData = {
            ...record,
            variant: 0 
        };
        
        res.json(responseData); 
    } else {
        res.status(404).json({ error: "Gratitude not found" });
    }
});

  // --- B. HANDLE NEW SUBMISSIONS ---
  socket.on('submit_gratitude', async (incomingData) => {

    if (!incomingData || typeof incomingData.message !== 'string' || typeof incomingData.lat !== 'number' || typeof incomingData.lng !== 'number') {
       return;
    }

    // 3. FIX: Validate coordinate ranges (Postgres will error if out of bounds, but better to catch here)
    if (incomingData.lat < -90 || incomingData.lat > 90 || incomingData.lng < -180 || incomingData.lng > 180) {
        return;
    }

    const ip = socket.handshake.address;
    const lastPostTime = rateLimitMap.get(ip) || 0;
    const now = Date.now();

    if (now - lastPostTime < 20000) { // Limit: 1 post every 20 seconds per IP
       socket.emit('error_msg', "You are being too grateful! Please wait 20 seconds.");
       return;
    }
    rateLimitMap.set(ip, now); // Update time

    const cleanMessage = xss(incomingData.message).substring(0, 280);
    const scrambledCoords = scrambleCoordinates(incomingData.lat, incomingData.lng);
    
    const shortCode = nanoid(10); // Generates a secure, 10-char ID

    const { data: savedRow, error: insertError } = await supabase
      .from('gratitudes')
      .insert({
        message: cleanMessage, // Use the clean version
        location: `POINT(${scrambledCoords.lng} ${scrambledCoords.lat})`,
        short_code: shortCode
      })
      .select()
      .single();

    if(!insertError) {
      const shareableLink = `https://thankmap.com/share/${shortCode}`;
      socket.emit('upload_success', { link: shareableLink });
    } else {
      console.error("❌ Database Write Error:", insertError.message);
      return; 
    }

    // 2. Broadcast to all users
    // We send back exactly what the frontend needs
    if (savedRow) {
      const broadcastData = {
        id: savedRow.id,
        message: savedRow.message,
        lat: scrambledCoords.lat,
        lng: scrambledCoords.lng,
        tempId: incomingData.tempId,
        short_code: savedRow.short_code
      };
      
      io.emit('new_blink', broadcastData);
    }
  });

  socket.on('disconnect', () => {
    console.log('👋 User disconnected');
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`✅ SERVER RUNNING on port ${PORT}`);
  console.log(`🔗 Connected to Supabase: ${supabaseUrl}`);
});
