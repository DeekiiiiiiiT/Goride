/**
 * Plus Code (Open Location Code) Encoder/Decoder
 * 
 * Plus Codes are a geocoding system by Google that encode latitude/longitude
 * into a compact alphanumeric code. They provide ~3m precision at 11 digits
 * and ~14m precision at 10 digits.
 * 
 * Format: XXXXXXXX+XX (full code) or XXXX+XX Reference (compound/short code)
 * 
 * Reference: https://github.com/google/open-location-code
 */

const CODE_ALPHABET = '23456789CFGHJMPQRVWX';
const SEPARATOR = '+';
const SEPARATOR_POSITION = 8;
const ENCODING_BASE = 20;

// Cell sizes for each pair position (both lat and lng use the same values)
const PAIR_CELL_SIZES = [20, 1, 0.05, 0.0025, 0.000125];

// Refinement grid dimensions (5 rows x 4 columns = 20 cells)
const GRID_ROWS = 5;
const GRID_COLUMNS = 4;

/**
 * Encode latitude/longitude into a Plus Code
 * @param lat Latitude (-90 to 90)
 * @param lng Longitude (-180 to 180)
 * @param codeLength Total number of digits (excluding separator). Default 11 for ~3m precision.
 *   - 8 digits: ~275m x 275m
 *   - 10 digits: ~14m x 14m
 *   - 11 digits: ~3m x 3.5m
 *   - 12 digits: ~0.6m x 0.87m
 */
export function encodePlusCode(lat: number, lng: number, codeLength: number = 11): string {
  // Clamp latitude
  lat = Math.max(-90, Math.min(90, lat));
  
  // Normalize longitude
  while (lng < -180) lng += 360;
  while (lng >= 180) lng -= 360;
  
  // Prevent encoding exactly at the north pole boundary
  if (lat >= 90) lat = 89.9999999;
  
  // Offset to positive values
  let adjLat = lat + 90;
  let adjLng = lng + 180;
  
  let code = '';
  let digitCount = 0;
  
  // Encode pair section (up to 5 pairs = 10 digits)
  const pairsToEncode = Math.min(5, Math.ceil(Math.min(codeLength, 10) / 2));
  
  for (let i = 0; i < pairsToEncode; i++) {
    const cellSize = PAIR_CELL_SIZES[i];
    
    const latIdx = Math.min(Math.floor(adjLat / cellSize), ENCODING_BASE - 1);
    const lngIdx = Math.min(Math.floor(adjLng / cellSize), ENCODING_BASE - 1);
    
    adjLat -= latIdx * cellSize;
    adjLng -= lngIdx * cellSize;
    
    code += CODE_ALPHABET[latIdx] + CODE_ALPHABET[lngIdx];
    digitCount += 2;
  }
  
  // Encode refinement section (digits 11+)
  if (codeLength > 10) {
    let latCellSize = PAIR_CELL_SIZES[4] / GRID_ROWS;
    let lngCellSize = PAIR_CELL_SIZES[4] / GRID_COLUMNS;
    
    while (digitCount < codeLength) {
      const row = Math.min(Math.floor(adjLat / latCellSize), GRID_ROWS - 1);
      const col = Math.min(Math.floor(adjLng / lngCellSize), GRID_COLUMNS - 1);
      
      code += CODE_ALPHABET[row * GRID_COLUMNS + col];
      
      adjLat -= row * latCellSize;
      adjLng -= col * lngCellSize;
      
      latCellSize /= GRID_ROWS;
      lngCellSize /= GRID_COLUMNS;
      
      digitCount++;
    }
  }
  
  // Insert separator after position 8
  if (code.length >= SEPARATOR_POSITION) {
    code = code.substring(0, SEPARATOR_POSITION) + SEPARATOR + code.substring(SEPARATOR_POSITION);
  } else {
    // Pad short codes with '0' up to separator position
    code = code.padEnd(SEPARATOR_POSITION, '0') + SEPARATOR;
  }
  
  return code;
}

/**
 * Decode a Plus Code into latitude/longitude (returns center of the code area)
 * @param code Full Plus Code (e.g. "7795X36X+5W")
 * @returns Center coordinates or null if invalid
 */
export function decodePlusCode(code: string): { lat: number; lng: number } | null {
  if (!isValidPlusCode(code)) return null;
  
  // Remove separator and convert to uppercase
  const cleaned = code.replace(SEPARATOR, '').toUpperCase().replace(/0+$/, '');
  
  let lat = -90.0;
  let lng = -180.0;
  let latCellSize = 0;
  let lngCellSize = 0;
  
  // Decode pair section
  const pairDigits = Math.min(cleaned.length, 10);
  const pairs = Math.floor(pairDigits / 2);
  
  for (let i = 0; i < pairs; i++) {
    const latChar = cleaned[i * 2];
    const lngChar = cleaned[i * 2 + 1];
    
    const latIdx = CODE_ALPHABET.indexOf(latChar);
    const lngIdx = CODE_ALPHABET.indexOf(lngChar);
    
    if (latIdx < 0 || lngIdx < 0) return null;
    
    const cellSize = PAIR_CELL_SIZES[i];
    lat += latIdx * cellSize;
    lng += lngIdx * cellSize;
    latCellSize = cellSize;
    lngCellSize = cellSize;
  }
  
  // Decode refinement section
  if (cleaned.length > 10) {
    let refLatCell = PAIR_CELL_SIZES[4] / GRID_ROWS;
    let refLngCell = PAIR_CELL_SIZES[4] / GRID_COLUMNS;
    
    for (let i = 10; i < cleaned.length; i++) {
      const digitIdx = CODE_ALPHABET.indexOf(cleaned[i]);
      if (digitIdx < 0) return null;
      
      const row = Math.floor(digitIdx / GRID_COLUMNS);
      const col = digitIdx % GRID_COLUMNS;
      
      lat += row * refLatCell;
      lng += col * refLngCell;
      
      latCellSize = refLatCell;
      lngCellSize = refLngCell;
      
      refLatCell /= GRID_ROWS;
      refLngCell /= GRID_COLUMNS;
    }
  }
  
  // Return center of the code area
  return {
    lat: lat + latCellSize / 2,
    lng: lng + lngCellSize / 2,
  };
}

/**
 * Validate a Plus Code string
 * Supports full codes (e.g. "7795X36X+5W") and compound codes (e.g. "X36X+5W Portmore")
 * For compound codes, only the code portion (before the space) is validated.
 */
export function isValidPlusCode(code: string): boolean {
  if (!code || typeof code !== 'string') return false;
  
  // Extract code portion (before any space for compound codes)
  const codePart = code.trim().split(/\s+/)[0].toUpperCase();
  
  // Must contain exactly one separator
  const sepIdx = codePart.indexOf(SEPARATOR);
  if (sepIdx < 0 || codePart.lastIndexOf(SEPARATOR) !== sepIdx) return false;
  
  // Separator must be at position 8 for full codes, or earlier for short codes
  if (sepIdx > SEPARATOR_POSITION) return false;
  
  // Must have at least 2 characters after the separator (or be a short code with locality)
  const afterSep = codePart.substring(sepIdx + 1);
  if (afterSep.length === 0) return false;
  
  // All characters (except separator) must be in the alphabet
  const cleaned = codePart.replace(SEPARATOR, '');
  for (const char of cleaned) {
    if (char === '0') continue; // Padding zeros are allowed
    if (!CODE_ALPHABET.includes(char)) return false;
  }
  
  return true;
}

/**
 * Check if a Plus Code is a full code (not shortened/compound)
 */
export function isFullPlusCode(code: string): boolean {
  if (!isValidPlusCode(code)) return false;
  const codePart = code.trim().split(/\s+/)[0].toUpperCase();
  const sepIdx = codePart.indexOf(SEPARATOR);
  return sepIdx === SEPARATOR_POSITION;
}

/**
 * Extract the code portion from a compound Plus Code (removes locality reference)
 * e.g. "X36X+5W Portmore" → "X36X+5W"
 */
export function extractCodePortion(code: string): string {
  return code.trim().split(/\s+/)[0].toUpperCase();
}

/**
 * Format a Plus Code for display with optional locality
 * @param code Full Plus Code
 * @param locality Optional locality name (e.g. "Portmore")
 * @returns Formatted code, optionally shortened with locality
 */
export function formatPlusCodeShort(code: string, locality?: string): string {
  if (!isFullPlusCode(code) || !locality) return code;
  
  // Shorten by removing the first 4 characters
  const shortened = code.substring(4);
  return `${shortened} ${locality}`;
}

/**
 * Get the precision description for a Plus Code
 */
export function getPlusCodePrecision(code: string): string {
  const cleaned = extractCodePortion(code).replace(SEPARATOR, '').replace(/0+$/, '');
  const digits = cleaned.length;
  
  if (digits <= 2) return '~400km';
  if (digits <= 4) return '~20km';
  if (digits <= 6) return '~1km';
  if (digits <= 8) return '~275m';
  if (digits <= 10) return '~14m';
  if (digits <= 11) return '~3m';
  return '~0.6m';
}

/**
 * Recover a full Plus Code from a short/compound code using a reference location.
 * Implements the Open Location Code "recoverNearest" algorithm.
 * 
 * @param shortCode The short Plus Code part (e.g. "X36X+5W")
 * @param refLat Reference latitude (from geocoding the locality)
 * @param refLng Reference longitude (from geocoding the locality)
 * @returns The recovered full Plus Code, or null if invalid
 * 
 * Example: recoverShortCode("X36X+5W", 17.95, -76.88) → "7795X36X+5W"
 */
export function recoverShortCode(shortCode: string, refLat: number, refLng: number): string | null {
  const codePart = shortCode.trim().split(/\s+/)[0].toUpperCase();
  
  if (!isValidPlusCode(codePart)) return null;
  
  // If it's already a full code, just return it
  const sepIdx = codePart.indexOf(SEPARATOR);
  if (sepIdx >= SEPARATOR_POSITION) return codePart;
  
  // Number of prefix digits we need to recover from the reference point
  const paddingLength = SEPARATOR_POSITION - sepIdx;
  
  // Resolution of the prefix area — determines the grid cell size for boundary checks
  // paddingLength is always even (2 or 4 or 6), corresponding to pair positions
  const resolution = Math.pow(ENCODING_BASE, 2 - (paddingLength / 2));
  
  // Encode the reference point to extract the area prefix
  const refCode = encodePlusCode(refLat, refLng, 10);
  const refClean = refCode.replace(SEPARATOR, '');
  
  // Reconstruct candidate full code by prepending the reference's prefix
  const shortClean = codePart.replace(SEPARATOR, '');
  const candidateClean = refClean.substring(0, paddingLength) + shortClean;
  const candidateCode = candidateClean.substring(0, SEPARATOR_POSITION) + SEPARATOR + candidateClean.substring(SEPARATOR_POSITION);
  
  // Decode the candidate to get its center
  const decoded = decodePlusCode(candidateCode);
  if (!decoded) return null;
  
  // Boundary correction: if the candidate center is more than half a resolution
  // away from the reference, we picked the wrong prefix — adjust.
  const halfResolution = resolution / 2;
  
  let correctedLat = decoded.lat;
  let correctedLng = decoded.lng;
  
  if (decoded.lat - refLat > halfResolution) {
    correctedLat -= resolution;
  } else if (refLat - decoded.lat > halfResolution) {
    correctedLat += resolution;
  }
  
  if (decoded.lng - refLng > halfResolution) {
    correctedLng -= resolution;
  } else if (refLng - decoded.lng > halfResolution) {
    correctedLng += resolution;
  }
  
  // If correction was needed, re-encode to get the correct full code
  if (correctedLat !== decoded.lat || correctedLng !== decoded.lng) {
    // Re-encode with the same code length as the short code implies
    const totalDigits = shortClean.length + paddingLength;
    return encodePlusCode(correctedLat, correctedLng, totalDigits);
  }
  
  return candidateCode;
}

/**
 * Extract the locality reference from a compound Plus Code.
 * e.g. "X36X+5W Portmore" → "Portmore"
 * e.g. "X36X+5W Old Harbour, Jamaica" → "Old Harbour, Jamaica"
 * Returns null if there's no locality portion.
 */
export function extractLocality(compoundCode: string): string | null {
  const trimmed = compoundCode.trim();
  const parts = trimmed.split(/\s+/);
  if (parts.length <= 1) return null;
  // Everything after the code portion is the locality
  return parts.slice(1).join(' ');
}

/**
 * Get the effective digit count for a Plus Code (excluding separator and trailing padding zeros).
 * Used internally by getDefaultGeofenceRadius and getPlusCodeCellSizeMeters.
 */
function getEffectiveDigitCount(plusCode?: string): number {
  if (!plusCode || typeof plusCode !== 'string') return 0;
  const codePart = extractCodePortion(plusCode);
  const cleaned = codePart.replace(SEPARATOR, '').replace(/0+$/, '');
  return cleaned.length;
}

/**
 * Get a smart default geofence radius in meters based on Plus Code precision.
 * 
 * The radius is the "fence" around the Plus Code anchor point within which
 * a fueling event is considered spatially valid. Tighter Plus Codes allow
 * tighter fences because the anchor precision is higher.
 * 
 * @param plusCode Optional Plus Code string
 * @returns Radius in meters:
 *   - No Plus Code or invalid → 150m (legacy default)
 *   - ≤8 digits (~275m cell) → 150m
 *   - 10 digits (~14m cell) → 75m
 *   - 11 digits (~3m cell) → 50m
 *   - ≥12 digits (~0.6m cell) → 30m
 */
export function getDefaultGeofenceRadius(plusCode?: string): number {
  const digits = getEffectiveDigitCount(plusCode);
  
  if (digits <= 0) return 150; // No Plus Code — legacy default
  if (digits <= 8) return 150; // ~275m precision — wide fence appropriate
  if (digits <= 10) return 75; // ~14m precision — medium fence
  if (digits <= 11) return 50; // ~3m precision — covers forecourt + parking
  return 30;                   // ~0.6m precision — ultra-tight around pumps
}

/**
 * Get the approximate cell dimensions in meters for a Plus Code.
 * 
 * Uses the degree-based cell sizes from the Open Location Code spec
 * and converts to meters. Longitude conversion is latitude-dependent;
 * defaults to ~18°N (Jamaica) if no latitude is provided.
 * 
 * @param plusCode Plus Code string
 * @param refLat Optional reference latitude for accurate longitude→meter conversion (default: 18.0)
 * @returns Cell dimensions in meters, or null if the Plus Code is invalid
 */
export function getPlusCodeCellSizeMeters(
  plusCode?: string,
  refLat: number = 18.0
): { latMeters: number; lngMeters: number; digits: number } | null {
  if (!plusCode || typeof plusCode !== 'string') return null;
  
  const digits = getEffectiveDigitCount(plusCode);
  if (digits <= 0) return null;
  
  // Degree-to-meter conversion factors
  const LAT_DEG_TO_METERS = 111_000; // 1° latitude ≈ 111km everywhere
  const lngDegToMeters = 111_000 * Math.cos((refLat * Math.PI) / 180);
  
  let latCellDeg: number;
  let lngCellDeg: number;
  
  if (digits <= 10) {
    // Pair section: each pair halves through PAIR_CELL_SIZES
    const pairIndex = Math.floor(digits / 2) - 1;
    const safeIndex = Math.max(0, Math.min(pairIndex, PAIR_CELL_SIZES.length - 1));
    latCellDeg = PAIR_CELL_SIZES[safeIndex];
    lngCellDeg = PAIR_CELL_SIZES[safeIndex];
  } else {
    // Refinement section: beyond 10 digits
    // Each refinement digit subdivides by 5 rows x 4 columns
    const refinementDigits = digits - 10;
    latCellDeg = PAIR_CELL_SIZES[4]; // Start from 10-digit cell size
    lngCellDeg = PAIR_CELL_SIZES[4];
    
    for (let i = 0; i < refinementDigits; i++) {
      latCellDeg /= GRID_ROWS;
      lngCellDeg /= GRID_COLUMNS;
    }
  }
  
  return {
    latMeters: Math.round(latCellDeg * LAT_DEG_TO_METERS * 100) / 100,
    lngMeters: Math.round(lngCellDeg * lngDegToMeters * 100) / 100,
    digits,
  };
}