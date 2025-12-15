// app/ThankMap.tsx
import React, { useRef, useEffect, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import io, { Socket } from 'socket.io-client';
import GratitudeForm from './GratitudeForm';
import MessageCard from './MessageCard';

// ⚠️ REQUIRED: Mapbox CSS
import 'mapbox-gl/dist/mapbox-gl.css';

// 🔑 REPLACE WITH YOUR TOKEN
console.log("--------------------------------------");
console.log("🌍 VITE_API_URL is:", import.meta.env.VITE_API_URL);
console.log("🔌 Connecting to:", import.meta.env.VITE_API_URL || 'http://localhost:3001');
console.log("--------------------------------------");

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

if (!mapboxgl.accessToken) {
  console.error("❌ Mapbox Token missing! Check your frontend .env file.");
}

// Define the shape of a Gratitude object
export interface Gratitude {
  id: number;
  name: string;
  message: string;
  lat: number;
  lng: number;
  variant: number;
  tempId?: string; // Add tempId as an optional property
}

// Connect to backend (ensure the port matches your server)
const socket: Socket = io(API_URL);

const ThankMap: React.FC = () => {
  // TypeScript Refs require the specific HTML element type
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const pendingMessageRef = useRef<string | null>(null);
  const pendingIdRef = useRef<string | null>(null);
  const [gratitudes, setGratitudes] = useState<Gratitude[]>([]);
  const [selectedGratitude, setSelectedGratitude] = useState<Gratitude | null>(null);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [isAutoPlay, setIsAutoPlay] = useState(false);

// 1. The Dot Factory
// We pass an 'offset' (in ms) to shift the breathing cycle
const createPulsingDot = (offset: number) => {
  return {
    width: 120,
    height: 120,
    data: new Uint8Array(120 * 120 * 4),
    context: null as CanvasRenderingContext2D | null,

    onAdd: function () {
      const canvas = document.createElement('canvas');
      canvas.width = this.width;
      canvas.height = this.height;
      this.context = canvas.getContext('2d', {willReadFrequently: true});
    },

    render: function () {
      const duration = 3000;
      // THE FIX: Add the unique offset to the current time
      const t = (performance.now() + offset) / duration; 

      // Smooth Breathing Math
      const tSmooth = (Math.sin(t * Math.PI * 2) + 1) / 2;

      const centerX = this.width / 2;
      const centerY = this.height / 2;
      const baseRadius = 8;
      const maxGlowRadius = 50;

      if (!this.context) return false;
      this.context.clearRect(0, 0, this.width, this.height);

      // Draw Outer Glow
      const currentGlowRadius = baseRadius + (maxGlowRadius - baseRadius) * tSmooth;
      const glowAlpha = 0.5 * tSmooth;

      const gradient = this.context.createRadialGradient(centerX, centerY, baseRadius, centerX, centerY, currentGlowRadius);
      gradient.addColorStop(0, `rgba(255, 220, 180, ${glowAlpha})`);
      gradient.addColorStop(1, `rgba(255, 220, 180, 0)`);

      this.context.beginPath();
      this.context.arc(centerX, centerY, currentGlowRadius, 0, Math.PI * 2);
      this.context.fillStyle = gradient;
      this.context.fill();

      // Draw Inner Dot
      const coreAlpha = 1.0 - (0.7 * tSmooth);
      this.context.beginPath();
      this.context.arc(centerX, centerY, baseRadius, 0, Math.PI * 2);
      this.context.fillStyle = `rgba(255, 255, 255, ${coreAlpha})`;
      this.context.fill();
      this.context.strokeStyle = `rgba(255, 255, 255, 0.3)`;
      this.context.lineWidth = 1;
      this.context.stroke();

      this.data = new Uint8Array(this.context.getImageData(0, 0, this.width, this.height).data.buffer);
      mapRef.current?.triggerRepaint();
      return true;
    }
  };
};

  // 2. Initialize Map & Socket
  useEffect(() => {
    // A. Socket Listeners
    socket.on('initial_data', (data: Gratitude[]) => {
        const enrichedData = data.map(g => ({
          ...g,
          // ✅ CORRECT: Assign random variant once when data loads
        variant: g.variant !== undefined ? g.variant : Math.floor(Math.random() * 10)
      }));
      setGratitudes(enrichedData);
    });

    socket.on('new_blink', (newGratitude: Gratitude) => {
      const enrichedGratitude = {
        ...newGratitude,
        // ✅ CORRECT: Assign random variant once when new blink arrives
        variant: Math.floor(Math.random() * 10) // Random 0-9
      };
      setGratitudes((prev) => [...prev, enrichedGratitude]);

      // ✨ AUTO-OPEN LOGIC:
      // If this incoming message matches what we just typed.

      if (pendingIdRef.current === newGratitude.tempId) {
        // 1. Open the card
        setSelectedGratitude(enrichedGratitude);

        // 2. Clear the pending ref
        pendingMessageRef.current = null;

        // 3. Fly to it (Zoom in to see your creation)
        mapRef.current?.flyTo({
          center: [enrichedGratitude.lng, enrichedGratitude.lat],
          zoom: 5,
          speed: 1.5,
          curve: 1
        });
      }
    });

    // B. Map Initialization
    // We check if mapContainerRef exists to satisfy TS
    if (mapContainerRef.current) {
      const map = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: 'mapbox://styles/mapbox/dark-v11',
        center: [0, 20],
        zoom: 1.5,
        projection: { name: 'globe' } as any
      });

      map.on('style.load', () => {
      map.setFog({
        color: 'rgb(186, 210, 235)', // Lower atmosphere
        'high-color': 'rgb(36, 92, 223)', // Upper atmosphere
        'horizon-blend': 0.02, // Atmosphere thickness (default 0.2 at low zooms)
        'space-color': 'rgb(11, 11, 25)', // Background color
        'star-intensity': 0.6 // Background stars
      });
    });

      mapRef.current = map;

      map.on('load', () => {
        setIsMapLoaded(true);

        const totalVariants = 10; // We want 10 different types
        const interval = 300; // Time offset between dots

        // We cast pulsingDot as 'any' to bypass strict Mapbox StyleImageInterface typing 
        // which can be tricky with the custom render function
        for (let i = 0; i < totalVariants; i++) {
          const id = `dot-${i}`;
          if (!map.hasImage(id)) {
            map.addImage(`dot-${i}`, createPulsingDot(i * interval) as any, { pixelRatio: 2 });
          }
        }

        if (!map.getSource('gratitude-source')) {
          map.addSource('gratitude-source', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: []},
            cluster: false
          });
        }

        map.addLayer({
          id: 'gratitude-layer',
          type: 'symbol',
          source: 'gratitude-source',
          layout: {
            // ⚠️ MAGIC: Choose the icon name dynamically based on data!
            'icon-image': ['get', 'icon'], 
            'icon-allow-overlap': true,
            'icon-size': 0.7
          }
        });

        // 1. Change cursor to pointer when hovering over a dot
        map.on('mouseenter', 'gratitude-layer', () => {
          map.getCanvas().style.cursor = 'pointer';
        });

        map.on('mouseleave', 'gratitude-layer', () => {
          map.getCanvas().style.cursor = '';
        });

        // 2. Handle the Click
        map.on('click', 'gratitude-layer', (e) => {
          if (!e.features || e.features.length === 0) return;

          const feature = e.features[0];

          // Mapbox properties come back as strings/json, so we cast them
          const properties = feature.properties as { message: string, id: number,  variant: number };

          // Get coordinates to center the map slightly (optional polish)
          const geometry = feature.geometry as any; // specific GeoJSON type casting can be tedious
          const coordinates = geometry.coordinates.slice();

          // Update React State to show the card
          setSelectedGratitude({
            id: properties.id,
            message: properties.message,
            lat: coordinates[1],
            lng: coordinates[0],
            name: '',
            variant: properties.variant, 
          });
        });
      });
    }

    // Cleanup
    return () => {
      mapRef.current?.remove();
      socket.off('initial_data');
      socket.off('new_blink');
    };
  }, []);

// 3. Update Data Effect
  useEffect(() => {
    const map = mapRef.current;
    if (!isMapLoaded || !map || !map.getSource('gratitude-source')) return;

    // Create GeoJSON from ALL gratitudes
    const geoJsonData: GeoJSON.FeatureCollection<GeoJSON.Geometry> = {
      type: 'FeatureCollection',
      features: gratitudes.map((g) => ({
        type: 'Feature',
        geometry: { 
          type: 'Point', 
          coordinates: [g.lng, g.lat] 
        },
        properties: { 
          id: g.id, 
          message: g.message, 
          variant: g.variant,
          // We construct the icon name here so Mapbox logic is simpler
          icon: `dot-${g.variant}` 
        }
      }))
    };

    const source = map.getSource('gratitude-source') as mapboxgl.GeoJSONSource;
    if (source) {
      source.setData(geoJsonData);
    }
  }, [gratitudes, isMapLoaded]);

  // 4. Sticky Popup Logic
  useEffect(() => {
    // If no card is selected, do nothing
    if (!selectedGratitude || !mapRef.current) return;

    const map = mapRef.current;
    
    // Function to move the HTML card to the correct map pixel
    const updatePosition = () => {
      if (!popupRef.current) return;

      const coords = [selectedGratitude.lng, selectedGratitude.lat] as [number, number];
      
      // Mapbox math: convert Lat/Lng -> Screen Pixels (x,y)
      const point = map.project(coords);

      // Directly update the DOM (bypassing React render for speed)
      // We translate the card to the dot's pixel location
      // The -50%, -100% in the CSS handles the centering alignment
      popupRef.current.style.transform = `translate(${point.x}px, ${point.y}px) translate(-50%, -100%)`;
    };

    // 1. Position immediately
    updatePosition();

    // 2. Reposition whenever the map moves (pan/zoom)
    map.on('move', updatePosition);
    map.on('moveend', updatePosition);

    // Cleanup listener when the card closes
    return () => {
      map.off('move', updatePosition);
      map.off('moveend', updatePosition);
    };
  }, [selectedGratitude]); // Re-run if we select a different dot

// 5. Polished Screensaver Logic
  useEffect(() => {
    // A. Basic Setup
    if (!isAutoPlay) {
      mapRef.current?.stop();
      return; // Stop here if autoplay is off
    }
    
    const map = mapRef.current;
    if (!map) return;

    // B. The Spin (Visuals)
    let animationFrameId: number;
    const rotateCamera = () => {
      // Double check active state inside the frame loop
      if (!isAutoPlay) return; 
      
      const currentCenter = map.getCenter();
      const newLng = currentCenter.lng - 0.02;
      map.jumpTo({ center: [newLng, currentCenter.lat], zoom: 2 });
      animationFrameId = requestAnimationFrame(rotateCamera);
    };
    rotateCamera(); 

    // C. The Spotlight (Lifecycle Manager)
    let spotlightTimer: NodeJS.Timeout;
    let hideTimer: NodeJS.Timeout;

    const runSpotlightCycle = () => {
      if (!isAutoPlay) return;

      // 1. Find visible dots
      const features = map.queryRenderedFeatures({ layers: ['gratitude-layer'] });

      if (features.length > 0) {
        const randomFeature = features[Math.floor(Math.random() * features.length)];
        const props = randomFeature.properties as any;
        const coords = (randomFeature.geometry as any).coordinates;

        const spotlitGratitude = {
          id: props.id,
          message: props.message,
          lat: coords[1],
          lng: coords[0],
          name: '',
          variant: props.variant
        };

        setSelectedGratitude(spotlitGratitude);

        // 2. Wait 5 seconds, then HIDE
        hideTimer = setTimeout(() => {
          // Only close if it's still the SAME card (prevents closing if user clicked another)
          setSelectedGratitude((current) => 
            current?.id === spotlitGratitude.id ? null : current
          );

          // 3. Wait 1 second buffer, then RESTART
          spotlightTimer = setTimeout(runSpotlightCycle, 1000); 
        }, 5000);

      } else {
        // No dots? Try again in 1 second
        spotlightTimer = setTimeout(runSpotlightCycle, 1000);
      }
    };

    // Start the loop
    runSpotlightCycle();

    // Cleanup
    return () => {
      cancelAnimationFrame(animationFrameId);
      clearTimeout(spotlightTimer);
      clearTimeout(hideTimer);
      map.stop();
    };
  }, [isAutoPlay]); // Dependency on isAutoPlay ensures this resets correctly

  useEffect(() => {
    if (!isAutoPlay || gratitudes.length === 0) return;

const pickVisibleGratitude = () => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    if (!map) return;

    // 1. Ask the GPU: "Which dots are currently visible on screen?"
    // This is much more accurate for a 3D globe than getBounds()
    const features = map.queryRenderedFeatures({ layers: ['gratitude-layer'] });

    if (features.length > 0) {
      // 2. Pick a random one from the visible set
      const randomFeature = features[Math.floor(Math.random() * features.length)];
      
      // 3. Extract the data (Mapbox flattens properties, so we parse them back)
      // We need to match the shape of your Gratitude interface
      const properties = randomFeature.properties as any;
      const geometry = randomFeature.geometry as any;
      const coords = geometry.coordinates; // [lng, lat]

      const autoPickedGratitude = {
        id: properties.id,
        message: properties.message,
        lat: coords[1],
        lng: coords[0],
        name: '',
        variant: properties.variant
      };

      // 4. Show it
      setSelectedGratitude(autoPickedGratitude);

      // 5. Hide it after 6 seconds (Fade Out)
      setTimeout(() => {
        // Only clear if we are still looking at THIS gratitude 
        // (prevents clearing a user-clicked one if they interrupted the screensaver)
        setSelectedGratitude(current => (current?.id === autoPickedGratitude.id ? null : current));
      }, 6000); 
    }
  };

    // Run this logic every 7 seconds (6s display + 1s buffer)
    const displayInterval = setInterval(pickVisibleGratitude, 7000);

    return () => clearInterval(displayInterval);
  }, [isAutoPlay, gratitudes]);

  const handleGratitudeSubmit = (data: { message: string, lat: number, lng: number, tempId: string }) => {
    // 1. Remember this message so we can auto-open it later
    pendingMessageRef.current = data.message;
    pendingIdRef.current = data.tempId;

    // 2. Send to server
    socket.emit('submit_gratitude', data);
};

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh' }}>
      {/* The Map Container */}
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

      {/* The Form (Sits on top because of absolute position in CSS) */}
      <GratitudeForm onSubmit={handleGratitudeSubmit} />

      {/* NEW: Render the card if a gratitude is selected */}
      {selectedGratitude && (
      <MessageCard 
        ref={popupRef} // <--- Pass the ref here!
        data={selectedGratitude} 
        onClose={() => setSelectedGratitude(null)} 
      />
      )}
      {/* Top Right Controls */}
      <div style={{ position: 'absolute', top: '20px', right: '20px', zIndex: 10 }}>
        <button
          onClick={() => setIsAutoPlay(!isAutoPlay)} // This toggles the state
          style={{
            background: isAutoPlay ? 'rgba(255, 215, 0, 0.2)' : 'rgba(255, 255, 255, 0.1)',
            backdropFilter: 'blur(5px)',
            border: isAutoPlay ? '1px solid #ffd700' : '1px solid rgba(255, 255, 255, 0.3)',
            color: isAutoPlay ? '#ffd700' : 'white',
            padding: '10px 20px',
            borderRadius: '20px',
            cursor: 'pointer',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.3s ease'
          }}
        >
          {isAutoPlay ? '⏸️ Auto-Play ON' : '▶️ Start Screensaver'}
        </button>
      </div>
    </div>
  );
};

export default ThankMap;