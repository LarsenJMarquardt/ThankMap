// HELPER 1: Deterministic Randomness
// Turns an ID (string/int) into a number 0...1.
// Returns the SAME number every time for the same ID (prevents jitter).
const getStableRandom = (seedId: any, salt: number = 0): number => {
  const str = String(seedId) + salt;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  const x = Math.sin(Math.abs(hash)) * 10000;
  return x - Math.floor(x);
};

// HELPER 2: Process the Dots (The Logic Core)
// Applies variants and scattering to the raw data
export const processGratitudes = (rawDots: any[]) => {
  // Constants for 10km Scatter (approx 0.09 degrees)
  const MAX_OFFSET = 0.09; 

  return rawDots.map((dot) => {
    // 1. Assign Variant (Step 3)
    // Uses ID to pick 1 of 10 variants (0-9)
    // We use a safe hash so it works with UUIDs or Numbers
    const variantSeed = Math.floor(getStableRandom(dot.id) * 10);
    
    // 2. Assign Location Offset (Step 4)
    // Generate two stable random numbers between -0.09 and +0.09
    const latOffset = (getStableRandom(dot.id, 1) - 0.5) * (MAX_OFFSET * 2);
    const lngOffset = (getStableRandom(dot.id, 2) - 0.5) * (MAX_OFFSET * 2);

    return {
      ...dot,
      // Ensure strict number types
      lat: parseFloat(dot.lat) + latOffset,
      lng: parseFloat(dot.lng) + lngOffset,
      variant: variantSeed, // 0 to 9
      
      // Store original location if needed for "truth" later
      original_lat: parseFloat(dot.lat),
      original_lng: parseFloat(dot.lng)
    };
  });
};