import React, { useRef, useEffect, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import io, { Socket } from 'socket.io-client';
import GratitudeForm from './GratitudeForm';
import MessageCard from './MessageCard';

import 'mapbox-gl/dist/mapbox-gl.css';

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
  name?: string;
  message: string;
  lat: number;
  lng: number;
  variant: number;
  tempId?: string;
  short_code?: string;
}

interface ThankMapProps {
  initialFocus?: Gratitude | null; // Optional prop
}

// Connect to backend
const socket: Socket = io(API_URL);

export default function ThankMap({ initialFocus }: ThankMapProps) {
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
      const t = (performance.now() + offset) / duration; 
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

  // 2. Initialize Map & Socket Listener
  useEffect(() => {
    // A. Socket Listeners
    socket.on('update_map_dots', (data: Gratitude[]) => {
      console.log("🔥 RECEIVED DOTS FROM SERVER:", data.length);
        const enrichedData = data.map(g => ({
          ...g,
          // ✅ CORRECT: Assign random variant once when data loads
        variant: g.variant !== undefined ? g.variant : (g.id % 10)
      }));
      setGratitudes(enrichedData);
    });

    socket.on('new_blink', (newGratitude: Gratitude) => {
      const enrichedGratitude = {
        ...newGratitude,
        variant: Math.floor(Math.random() * 10) // Random 0-9
      };
      setGratitudes((prev) => [...prev, enrichedGratitude]);

      if (pendingIdRef.current === newGratitude.tempId) {
        // 1. Open the card
        setSelectedGratitude(enrichedGratitude);
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
        center: initialFocus ? [initialFocus.lng, initialFocus.lat] : [0, 20],
        zoom: initialFocus ? 6 : 1.5,
        projection: { name: 'globe' } as any
      });

      mapRef.current = map;

      map.on('style.load', () => {
      map.setFog({
        color: 'rgb(186, 210, 235)', // Lower atmosphere
        'high-color': 'rgb(36, 92, 223)', // Upper atmosphere
        'horizon-blend': 0.02, // Atmosphere thickness (default 0.2 at low zooms)
        'space-color': 'rgb(11, 11, 25)', // Background color
        'star-intensity': 0.6 // Background stars
      });
    });

      map.on('load', () => {
        setIsMapLoaded(true);

        const totalVariants = 10; // We want 10 different types
        const interval = 300; // Time offset between dots
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
            'icon-image': ['get', 'icon'], 
            'icon-allow-overlap': true,
            'icon-size': 0.7
          }
        });

        // Change & Click Handlers
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
          const properties = feature.properties as any;
          const geometry = feature.geometry as any; // specific GeoJSON type casting can be tedious
          const coordinates = geometry.coordinates.slice();

          setSelectedGratitude({
            id: properties.id,
            message: properties.message,
            lat: coordinates[1],
            lng: coordinates[0],
            name: '',
            variant: properties.variant,
            short_code: properties.short_code
          });
        });

        if (map.isStyleLoaded()) {
          const bounds = getSafeBounds(map);
          if (!bounds) return;
          socket.emit('map_bounds', {
              north: bounds.north,
              south: bounds.south,
              east: bounds.east,
              west: bounds.west
          });
        }

        map.on('moveend', () => {
          const bounds = getSafeBounds(map);
          if (!bounds) return;
          socket.emit('map_bounds', {
              north: bounds.north,
              south: bounds.south,
              east: bounds.east,
              west: bounds.west
          });
        });
      });
    }

    return () => {
      mapRef.current?.remove();
      socket.off('update_map_dots');
      socket.off('new_blink');
    };
  }, []);

  const getSafeBounds = (map: mapboxgl.Map) => {
  const bounds = map.getBounds();
  if (!bounds) return;
  let north = bounds.getNorth();
  let south = bounds.getSouth();
  let east = bounds.getEast();
  let west = bounds.getWest();

  // 1. ADD PADDING (Expand the search area by 20%)
  // This ensures dots act as a buffer just off-screen
  const latBuffer = (north - south) * 0.2;
  const lngBuffer = (east - west) * 0.2;

  north += latBuffer;
  south -= latBuffer;
  east += lngBuffer;
  west -= lngBuffer;

  // 2. CLAMP LATITUDE (Postgres crashes if > 90)
  if (north > 90) north = 90;
  if (south < -90) south = -90;

  // 3. HANDLE LONGITUDE WRAPPING (The "World Wrap" fix)
  // If the user zooms out far, West might be -200. We simply clamp to world limits.
  // Ideally, you'd handle the dateline crossing, but for now, looking at the whole world is safer.
  if (west < -180) west = -180;
  if (east > 180) east = 180;
  if (west > east) {
     // If we cross the date line (e.g. West 170, East -170), 
     // just ask for the whole world width to be safe for this MVP.
     west = -180;
     east = 180;
  }

  return { north, south, east, west };
};

// 3. Handle Shared Links
  useEffect(() => {
    if (initialFocus && isMapLoaded) {
        console.log("Opening shared gratitude:", initialFocus);
        
        // Set the selected gratitude to open the card
        setSelectedGratitude({
            ...initialFocus,
            variant: initialFocus.variant || 0 // Fallback
        });

        mapRef.current?.flyTo({
            center: [initialFocus.lng, initialFocus.lat],
            zoom: 6,
            essential: true
        });
    }
  }, [initialFocus, isMapLoaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!isMapLoaded || !map || !map.getSource('gratitude-source')) return;

    // 4. Create GeoJSON from ALL gratitudes
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
          icon: `dot-${g.variant}`,
          short_code: g.short_code,
        }
      }))
    };

    const source = map.getSource('gratitude-source') as mapboxgl.GeoJSONSource;
    if (source) {
      source.setData(geoJsonData);
    }
  }, [gratitudes, isMapLoaded]);

  // 5. Sticky Popup Logic
  useEffect(() => {
    if (!selectedGratitude || !mapRef.current) return;
    const map = mapRef.current;
    
    const updatePosition = () => {
      if (!popupRef.current) return;
      const coords = [selectedGratitude.lng, selectedGratitude.lat] as [number, number];
      const point = map.project(coords);
      popupRef.current.style.transform = `translate(${point.x}px, ${point.y}px) translate(-50%, -100%)`;
    };

    updatePosition();
    map.on('move', updatePosition);
    map.on('moveend', updatePosition);

    return () => {
      map.off('move', updatePosition);
      map.off('moveend', updatePosition);
    };
  }, [selectedGratitude]);

// 6. Screensaver Logic
  useEffect(() => { 
    if (!isAutoPlay) {
      mapRef.current?.stop();
      return;
    }
    const map = mapRef.current;
    if (!map) return;

    let animationFrameId: number;
    const rotateCamera = () => {
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

        hideTimer = setTimeout(() => {
          setSelectedGratitude((current) => 
            current?.id === spotlitGratitude.id ? null : current
          );
          spotlightTimer = setTimeout(runSpotlightCycle, 1000); 
        }, 5000);
      } else {
        spotlightTimer = setTimeout(runSpotlightCycle, 1000);
      }
    };
    runSpotlightCycle();

    // Cleanup
    return () => {
      cancelAnimationFrame(animationFrameId);
      clearTimeout(spotlightTimer);
      clearTimeout(hideTimer);
      map.stop(); 
    };
  }, [isAutoPlay]);

//   useEffect(() => {
//     if (!isAutoPlay || gratitudes.length === 0) return;

// const pickVisibleGratitude = () => {
//     const map = mapRef.current;
//     if (!map?.isStyleLoaded()) return;
//     if (!map) return;

//     // 1. Ask the GPU: "Which dots are currently visible on screen?"
//     // This is much more accurate for a 3D globe than getBounds()
//     const features = map.queryRenderedFeatures({ layers: ['gratitude-layer'] });

//     if (features.length > 0) {
//       // 2. Pick a random one from the visible set
//       const randomFeature = features[Math.floor(Math.random() * features.length)];
      
//       // 3. Extract the data (Mapbox flattens properties, so we parse them back)
//       // We need to match the shape of your Gratitude interface
//       const properties = randomFeature.properties as any;
//       const geometry = randomFeature.geometry as any;
//       const coords = geometry.coordinates; // [lng, lat]

//       const autoPickedGratitude = {
//         id: properties.id,
//         message: properties.message,
//         lat: coords[1],
//         lng: coords[0],
//         name: '',
//         variant: properties.variant
//       };

//       // 4. Show it
//       setSelectedGratitude(autoPickedGratitude);

//       // 5. Hide it after 6 seconds (Fade Out)
//       setTimeout(() => {
//         // Only clear if we are still looking at THIS gratitude 
//         // (prevents clearing a user-clicked one if they interrupted the screensaver)
//         setSelectedGratitude(current => (current?.id === autoPickedGratitude.id ? null : current));
//       }, 6000); 
//     }
//   };

//     // Run this logic every 7 seconds (6s display + 1s buffer)
//     const displayInterval = setInterval(pickVisibleGratitude, 7000);

//     return () => clearInterval(displayInterval);
//   }, [isAutoPlay, gratitudes]);

  const handleGratitudeSubmit = (data: { message: string, lat: number, lng: number, tempId: string }) => {
    pendingMessageRef.current = data.message;
    pendingIdRef.current = data.tempId;
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
        ref={popupRef}
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