import React, { useRef, useEffect, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import io, { Socket } from 'socket.io-client';
import GratitudeForm from './GratitudeForm';
import MessageCard from './MessageCard';

import 'mapbox-gl/dist/mapbox-gl.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

if (!mapboxgl.accessToken) {
  console.error("❌ Mapbox Token missing! Check your frontend .env file.");
}

// ============================================================================
// TYPES
// ============================================================================

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
  initialFocus?: Gratitude | null;
}

// ============================================================================
// SOCKET CONNECTION (singleton outside component)
// ============================================================================

const socket: Socket = io(API_URL);

// ============================================================================
// DEBOUNCE UTILITY (if you don't have lodash)
// ============================================================================

function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): T & { cancel: () => void } {
  let timeout: NodeJS.Timeout | null = null;

  const debounced = function (this: any, ...args: Parameters<T>) {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  } as T & { cancel: () => void };

  debounced.cancel = () => {
    if (timeout) clearTimeout(timeout);
  };

  return debounced;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function ThankMap({ initialFocus }: ThankMapProps) {
  // Map refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  
  // State
  const [gratitudes, setGratitudes] = useState<Gratitude[]>([]);
  const [selectedGratitudes, setSelectedGratitudes] = useState<Gratitude[]>([]);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [isAutoPlay, setIsAutoPlay] = useState(false);
  
  // Submission tracking
  const pendingIdRef = useRef<string | null>(null);
  
  // 🚨 REQUEST MANAGEMENT
  const lastBoundsRef = useRef<string>('');
  const hasInitialDataRef = useRef(false);
  const requestCountRef = useRef(0); // Debug counter

  // ============================================================================
  // PULSING DOT FACTORY
  // ============================================================================

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
        this.context = canvas.getContext('2d', { willReadFrequently: true });
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

        // Outer Glow
        const currentGlowRadius = baseRadius + (maxGlowRadius - baseRadius) * tSmooth;
        const glowAlpha = 0.5 * tSmooth;

        const gradient = this.context.createRadialGradient(
          centerX, centerY, baseRadius,
          centerX, centerY, currentGlowRadius
        );
        gradient.addColorStop(0, `rgba(255, 220, 180, ${glowAlpha})`);
        gradient.addColorStop(1, `rgba(255, 220, 180, 0)`);

        this.context.beginPath();
        this.context.arc(centerX, centerY, currentGlowRadius, 0, Math.PI * 2);
        this.context.fillStyle = gradient;
        this.context.fill();

        // Inner Dot
        const coreAlpha = 1.0 - (0.7 * tSmooth);
        this.context.beginPath();
        this.context.arc(centerX, centerY, baseRadius, 0, Math.PI * 2);
        this.context.fillStyle = `rgba(255, 255, 255, ${coreAlpha})`;
        this.context.fill();
        this.context.strokeStyle = `rgba(255, 255, 255, 0.3)`;
        this.context.lineWidth = 1;
        this.context.stroke();

        this.data = new Uint8Array(
          this.context.getImageData(0, 0, this.width, this.height).data.buffer
        );
        mapRef.current?.triggerRepaint();
        return true;
      }
    };
  };

  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================

  const getSafeBounds = (map: mapboxgl.Map) => {
    const bounds = map.getBounds();
    if (!bounds) return null;

    let north = bounds.getNorth();
    let south = bounds.getSouth();
    let east = bounds.getEast();
    let west = bounds.getWest();

    // Add 20% padding
    const latBuffer = (north - south) * 0.2;
    const lngBuffer = (east - west) * 0.2;

    north = Math.min(90, north + latBuffer);
    south = Math.max(-90, south - latBuffer);
    east = Math.min(180, east + lngBuffer);
    west = Math.max(-180, west - lngBuffer);

    // Handle dateline crossing
    if (west > east) {
      west = -180;
      east = 180;
    }

    return { north, south, east, west };
  };

  // Serialize bounds for comparison (2 decimal places = ~1km precision)
  const serializeBounds = (bounds: any) => {
    if (!bounds) return '';
    return `${bounds.north.toFixed(2)},${bounds.south.toFixed(2)},${bounds.east.toFixed(2)},${bounds.west.toFixed(2)}`;
  };

  // 🚨 DEBOUNCED BOUNDS EMISSION - CRITICAL FIX
  const emitMapBounds = useCallback(
    debounce((bounds: any) => {
      if (!bounds) return;
      
      const boundsKey = serializeBounds(bounds);
      
      // Skip if same as last request
      if (boundsKey === lastBoundsRef.current) {
        console.log('🛑 Skipping duplicate bounds request');
        return;
      }
      
      // Skip during autoplay
      if (isAutoPlay) {
        console.log('🛑 Skipping bounds request during screensaver');
        return;
      }
      
      requestCountRef.current += 1;
      console.log(`📤 Request #${requestCountRef.current} - Bounds:`, boundsKey);
      
      lastBoundsRef.current = boundsKey;
      socket.emit('map_bounds', bounds);
    }, 500), // 500ms delay after movement stops
    [isAutoPlay]
  );

  // ============================================================================
  // EFFECT 1: INITIALIZE MAP & SOCKET LISTENERS
  // ============================================================================

  useEffect(() => {
    console.log('🎬 Initializing ThankMap...');
    
    // --- SOCKET LISTENERS ---
    
    // Initial data load
    socket.on('initial_data', (data: Gratitude[]) => {
      console.log("📦 INITIAL DATA:", data.length, "gratitudes");
      hasInitialDataRef.current = true;
      const enrichedData = data.map(g => ({
        ...g,
        variant: g.variant !== undefined ? g.variant : (g.id % 10)
      }));
      setGratitudes(enrichedData);
    });

    // Updates from map panning/zooming
    socket.on('update_map_dots', (data: Gratitude[]) => {
      console.log("🔄 UPDATE:", data.length, "gratitudes");
      const enrichedData = data.map(g => ({
        ...g,
        variant: g.variant !== undefined ? g.variant : (g.id % 10)
      }));
      setGratitudes(enrichedData);
    });

    // New gratitude broadcast
    socket.on('new_blink', (newGratitude: Gratitude) => {
      console.log("✨ NEW BLINK:", newGratitude.id);
      const enrichedGratitude = {
        ...newGratitude,
        variant: Math.floor(Math.random() * 10)
      };
      
      setGratitudes((prev) => [...prev, enrichedGratitude]);

      // If this is the user's submission, show it
      if (pendingIdRef.current === newGratitude.tempId) {
        setSelectedGratitudes([enrichedGratitude]);
        pendingIdRef.current = null;

        mapRef.current?.flyTo({
          center: [enrichedGratitude.lng, enrichedGratitude.lat],
          zoom: 5,
          speed: 1.5,
          curve: 1
        });
      }
    });

    // --- MAP INITIALIZATION ---
    
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
          color: 'rgb(186, 210, 235)',
          'high-color': 'rgb(36, 92, 223)',
          'horizon-blend': 0.02,
          'space-color': 'rgb(11, 11, 25)',
          'star-intensity': 0.6
        });
      });

      map.on('load', () => {
        console.log('🗺️  Map loaded');
        setIsMapLoaded(true);

        // Add pulsing dot images
        for (let i = 0; i < 10; i++) {
          const id = `dot-${i}`;
          if (!map.hasImage(id)) {
            const dot = createPulsingDot(i * 300);
            map.addImage(id, dot as any, { pixelRatio: 2 });
          }
        }

        // Add source and layer
        if (!map.getSource('gratitude-source')) {
          map.addSource('gratitude-source', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
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

        // Mouse interactions
        map.on('mouseenter', 'gratitude-layer', () => {
          map.getCanvas().style.cursor = 'pointer';
        });

        map.on('mouseleave', 'gratitude-layer', () => {
          map.getCanvas().style.cursor = '';
        });

        // Click handler
        map.on('click', 'gratitude-layer', (e) => {
          if (!e.features || e.features.length === 0) return;
          const feature = e.features[0];
          const properties = feature.properties as any;
          const geometry = feature.geometry as any;
          const coordinates = geometry.coordinates.slice();

          const clickedGratitude = {
            id: properties.id,
            message: properties.message,
            lat: coordinates[1],
            lng: coordinates[0],
            name: '',
            variant: properties.variant,
            short_code: properties.short_code
          };

          // Show only the clicked one (turn off screensaver if active)
          setIsAutoPlay(false);
          setSelectedGratitudes([clickedGratitude]);
        });

        // 🚨 FIX: Only request bounds ONCE on initial load
        // AND only if we don't already have initial_data
        if (!hasInitialDataRef.current && map.isStyleLoaded()) {
          const bounds = getSafeBounds(map);
          if (bounds) {
            console.log('📤 Initial bounds request');
            socket.emit('map_bounds', bounds);
          }
        }

        // 🚨 FIX: Use DEBOUNCED function for moveend
        map.on('moveend', () => {
          const bounds = getSafeBounds(map);
          if (bounds) {
            emitMapBounds(bounds);
          }
        });
      });
    }

    // Cleanup
    return () => {
      console.log('🧹 Cleaning up ThankMap...');
      emitMapBounds.cancel(); // Cancel any pending debounced calls
      mapRef.current?.remove();
      socket.off('initial_data');
      socket.off('update_map_dots');
      socket.off('new_blink');
    };
  }, [emitMapBounds]); // Include emitMapBounds in dependencies

  // ============================================================================
  // EFFECT 2: UPDATE MAP DATA (gratitudes -> GeoJSON)
  // ============================================================================

  useEffect(() => {
    const map = mapRef.current;
    if (!isMapLoaded || !map || !map.getSource('gratitude-source')) return;

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

  // ============================================================================
  // EFFECT 3: HANDLE SHARED LINKS (initialFocus)
  // ============================================================================

  useEffect(() => {
    if (initialFocus && isMapLoaded) {
      console.log("🔗 Opening shared gratitude:", initialFocus);

      setSelectedGratitudes([{
        ...initialFocus,
        variant: initialFocus.variant || 0
      }]);

      mapRef.current?.flyTo({
        center: [initialFocus.lng, initialFocus.lat],
        zoom: 6,
        essential: true
      });
    }
  }, [initialFocus, isMapLoaded]);

  // ============================================================================
  // EFFECT 4: SCREENSAVER MODE
  // ============================================================================

  useEffect(() => {
    if (!isAutoPlay || !isMapLoaded) {
      mapRef.current?.stop();
      return;
    }

    console.log('🎬 Starting screensaver mode');
    const map = mapRef.current;
    if (!map) return;

    let animationFrameId: number;
    let spotlightInterval: NodeJS.Timeout;

    // 🚨 FIX: Use jumpTo (doesn't trigger moveend events)
    const rotateCamera = () => {
      if (!isAutoPlay) return;
      const currentCenter = map.getCenter();
      const newLng = currentCenter.lng - 0.02;
      
      // jumpTo is instant and doesn't fire moveend
      map.jumpTo({ center: [newLng, currentCenter.lat], zoom: 2 });
      animationFrameId = requestAnimationFrame(rotateCamera);
    };

    // Spotlight cycle - show 3 gratitudes at once
    const runSpotlightCycle = () => {
      if (!isAutoPlay) return;

      const features = map.queryRenderedFeatures({ 
        layers: ['gratitude-layer'] 
      });

      if (features.length > 0) {
        const shuffled = [...features].sort(() => Math.random() - 0.5);
        const selected = shuffled.slice(0, Math.min(3, shuffled.length));

        const spotlitGratitudes = selected.map(feature => {
          const props = feature.properties as any;
          const coords = (feature.geometry as any).coordinates;

          return {
            id: props.id,
            message: props.message,
            lat: coords[1],
            lng: coords[0],
            name: '',
            variant: props.variant,
            short_code: props.short_code
          };
        });

        setSelectedGratitudes(spotlitGratitudes);
      }
    };

    // Start rotation
    rotateCamera();

    // Run spotlight every 5 seconds
    runSpotlightCycle();
    spotlightInterval = setInterval(runSpotlightCycle, 5000);

    // Cleanup
    return () => {
      console.log('⏸️  Stopping screensaver mode');
      cancelAnimationFrame(animationFrameId);
      clearInterval(spotlightInterval);
      map.stop();
    };
  }, [isAutoPlay, isMapLoaded]);

  // ============================================================================
  // EFFECT 5: CLOSE CARDS WHEN CLICKING ELSEWHERE
  // ============================================================================

  useEffect(() => {
    if (!isMapLoaded || !mapRef.current) return;

    const map = mapRef.current;

    const handleMapClick = (e: mapboxgl.MapMouseEvent) => {
      const features = map.queryRenderedFeatures(e.point, {
        layers: ['gratitude-layer']
      });

      if (features.length === 0 && !isAutoPlay) {
        setSelectedGratitudes([]);
      }
    };

    map.on('click', handleMapClick);

    return () => {
      map.off('click', handleMapClick);
    };
  }, [isMapLoaded, isAutoPlay]);

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleGratitudeSubmit = (data: { 
    message: string; 
    lat: number; 
    lng: number; 
    tempId: string 
  }) => {
    pendingIdRef.current = data.tempId;
    socket.emit('submit_gratitude', data);
  };

  const handleCloseCard = (id: number) => {
    setSelectedGratitudes(prev => prev.filter(g => g.id !== id));
  };

  // ============================================================================
  // DEBUG: Log request count periodically
  // ============================================================================
  
  useEffect(() => {
    const interval = setInterval(() => {
      console.log(`📊 Total DB requests so far: ${requestCountRef.current}`);
    }, 30000); // Every 30 seconds

    return () => clearInterval(interval);
  }, []);

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh' }}>
      {/* Map Container */}
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

      {/* Gratitude Form */}
      {!isAutoPlay && <GratitudeForm onSubmit={handleGratitudeSubmit} />}

      {/* Message Cards - can show up to 3 */}
      {selectedGratitudes.map((gratitude, index) => (
        <MessageCard
          key={gratitude.id}
          data={gratitude}
          onClose={() => handleCloseCard(gratitude.id)}
          position={selectedGratitudes.length > 1 ? index : undefined}
          totalCards={selectedGratitudes.length}
        />
      ))}

      {/* Screensaver Toggle */}
      <div style={{ position: 'absolute', top: '20px', right: '20px', zIndex: 10 }}>
        <button
          onClick={() => {
            setIsAutoPlay(!isAutoPlay);
            if (!isAutoPlay) {
              setSelectedGratitudes([]);
            }
          }}
          style={{
            background: isAutoPlay 
              ? 'rgba(255, 215, 0, 0.2)' 
              : 'rgba(255, 255, 255, 0.1)',
            backdropFilter: 'blur(5px)',
            border: isAutoPlay 
              ? '1px solid #ffd700' 
              : '1px solid rgba(255, 255, 255, 0.3)',
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
          {isAutoPlay ? '⏸️ Screensaver ON' : '▶️ Start Screensaver'}
        </button>
      </div>

      {/* Debug Counter */}
      {import.meta.env.DEV && (
        <div style={{
          position: 'absolute',
          bottom: '20px',
          left: '20px',
          background: 'rgba(0, 0, 0, 0.7)',
          color: 'white',
          padding: '10px',
          borderRadius: '5px',
          fontSize: '12px',
          zIndex: 1000
        }}>
          DB Requests: {requestCountRef.current}
        </div>
      )}
    </div>
  );
}
