import { FuelEntry } from '../types/fuel';
import { StationProfile, StationStats } from '../types/station';
import { encodePlusCode } from './plusCode';

/** Parse YYYY-MM-DD as local calendar day (never UTC midnight). */
function parseYmdLocal(ymd: string): Date {
  const [y, m, d] = String(ymd).split('T')[0].split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** Monday–Sunday fleet calendar week containing `ref` (local). */
function fleetWeekBounds(ref = new Date()): { start: Date; end: Date } {
  const day = ref.getDay(); // 0 Sun .. 6 Sat
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const start = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() + mondayOffset);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

// Helper to generate a simple hash for ID
export const generateStationId = (name: string, address: string): string => {
  const str = `${name.toLowerCase().trim()}|${address.toLowerCase().trim()}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return `st_${Math.abs(hash).toString(16)}`;
};

export const normalizeStationName = (name: string): string => {
  if (!name) return 'Unknown Station';
  return name
    .trim()
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .replace(/\b(Rd|St|Ave|Blvd)\.?\b/gi, (match) => { // Standardize suffixes
       if (match.toLowerCase().startsWith('rd')) return 'Road';
       if (match.toLowerCase().startsWith('st')) return 'Street';
       if (match.toLowerCase().startsWith('ave')) return 'Avenue';
       if (match.toLowerCase().startsWith('blvd')) return 'Boulevard';
       return match;
    });
};

export const inferBrandFromName = (name: string): string => {
  const lower = name.toLowerCase();
  if (lower.includes('shell')) return 'Shell';
  if (lower.includes('texaco')) return 'Texaco';
  if (lower.includes('total')) return 'Total';
  if (lower.includes('rubis')) return 'Rubis';
  if (lower.includes('cool')) return 'Cool Corp';
  if (lower.includes('fesco')) return 'Fesco';
  if (lower.includes('petcom')) return 'Petcom';
  return 'Independent';
};

export const aggregateStations = (logs: FuelEntry[] | null | undefined): StationProfile[] => {
  const stationMap = new Map<string, {
    name: string;
    address: string;
    brand: string;
    entries: FuelEntry[];
    isVerifiedStation: boolean;
  }>();

  // Standalone Stations page may mount before fuel entries load — never iterate undefined.
  if (!Array.isArray(logs) || logs.length === 0) return [];

  // 1. Group logs by station identity
  // Priority: matchedStationId (verified link) > bridgedStationId > vendor name hash
  logs.forEach(log => {
    // Skip manual entries with no data
    if (log.location === 'Manual Entry' && !log.amount) return;

    // Check for verified station link (set by the Evidence Bridge or reconciler)
    const verifiedId = log.matchedStationId 
      || log.metadata?.matchedStationId 
      || log.metadata?.bridgedStationId;

    let name = normalizeStationName(log.location || 'Unidentified Station');
    let address = log.stationAddress || 'Unknown Address';
    
    // Handle persistent "Unknown" entries
    if (name === 'Unknown' || !name) {
      name = 'Unidentified Station';
    }

    // Use verified station ID when available, otherwise fall back to name hash
    const id = verifiedId || generateStationId(name, address);

    if (!stationMap.has(id)) {
      stationMap.set(id, {
        name,
        address,
        brand: inferBrandFromName(name),
        entries: [],
        isVerifiedStation: !!verifiedId,
      });
    }
    stationMap.get(id)!.entries.push(log);
  });

  // 2. Compute Profiles
  return Array.from(stationMap.entries()).map(([id, data]) => {
    // Sort entries by date desc
    const sortedEntries = data.entries.sort((a, b) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    const latest = sortedEntries[0];
    const prices = sortedEntries
      .filter(e => e.pricePerLiter && e.pricePerLiter > 0)
      .map(e => e.pricePerLiter!);

    const avgPrice = prices.length > 0 
      ? prices.reduce((a, b) => a + b, 0) / prices.length 
      : 0;

    // Trend Analysis (Simple: compare latest vs avg)
    let trend: 'Up' | 'Down' | 'Stable' = 'Stable';
    if (latest.pricePerLiter) {
       if (latest.pricePerLiter > avgPrice * 1.02) trend = 'Up';
       else if (latest.pricePerLiter < avgPrice * 0.98) trend = 'Down';
    }

    // Mock Location (Lat/Lng) - In a real app, this would come from a Geocoding service or DB
    // For now, we'll randomize slightly around a central point (Kingston, Jamaica) to populate the map
    // unless real coords are in metadata
    let lat = 18.0179;
    let lng = -76.8099;
    
    // Try to extract real coordinates from entries' locationMetadata
    const entryWithCoords = sortedEntries.find(e => 
      (e.locationMetadata?.lat && e.locationMetadata?.lng) ||
      (e.metadata?.location?.lat && e.metadata?.location?.lng)
    );
    if (entryWithCoords) {
      lat = entryWithCoords.locationMetadata?.lat || entryWithCoords.metadata?.location?.lat || lat;
      lng = entryWithCoords.locationMetadata?.lng || entryWithCoords.metadata?.location?.lng || lng;
    } else {
      // Deterministic pseudo-random offset based on ID for consistent demo mapping
      const idForHash = id.replace(/[^a-f0-9]/gi, '').slice(0, 8);
      const hashVal = parseInt(idForHash, 16) || 0;
      lat += ((hashVal % 100) - 50) * 0.001;
      lng += (((hashVal >> 8) % 100) - 50) * 0.001;
    }

    return {
      id,
      name: data.name,
      address: data.address,
      brand: data.brand,
      location: { lat, lng },
      plusCode: encodePlusCode(lat, lng, 11),
      isPreferred: false, // Default
      stats: {
        avgPrice,
        lastPrice: latest.pricePerLiter || 0,
        priceTrend: trend,
        totalVisits: sortedEntries.length,
        rating: 0, // Placeholder
        lastUpdated: latest.date
      },
      // Phase 10 Defaults
      amenities: [],
      dataSource: 'log',
      contactInfo: {},
      status: 'active',
      city: 'Unknown City',
      parish: 'Unknown Parish'
    };
  });
};

export const calculateRegionalStats = (stations: StationProfile[]) => {
  const activeStations = stations.filter(s => s?.stats?.lastPrice && s.stats.lastPrice > 0);
  if (activeStations.length === 0) return { minPrice: 0, maxPrice: 0, avgPrice: 0 };

  const prices = activeStations.map(s => s.stats.lastPrice);
  return {
    minPrice: Math.min(...prices),
    maxPrice: Math.max(...prices),
    avgPrice: prices.reduce((a, b) => a + b, 0) / prices.length
  };
};

export const calculateDashboardKPIs = (logs: FuelEntry[], regionalMinPrice: number) => {
  const { start: thisWeekStart, end: thisWeekEnd } = fleetWeekBounds();
  const lastWeekEnd = new Date(thisWeekStart);
  lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);
  lastWeekEnd.setHours(23, 59, 59, 999);
  const lastWeekStart = new Date(lastWeekEnd);
  lastWeekStart.setDate(lastWeekStart.getDate() - 6);
  lastWeekStart.setHours(0, 0, 0, 0);

  const inRange = (ymd: string, start: Date, end: Date) => {
    const d = parseYmdLocal(ymd);
    return d >= start && d <= end;
  };

  const thisWeekLogs = logs.filter((l) => inRange(l.date, thisWeekStart, thisWeekEnd));
  const lastWeekLogs = logs.filter((l) => inRange(l.date, lastWeekStart, lastWeekEnd));

  // Calculate Weighted Average Price (This Week)
  let totalVolumeThisWeek = 0;
  let totalCostThisWeek = 0;
  thisWeekLogs.forEach(l => {
    if (l.liters && l.amount) {
      totalVolumeThisWeek += l.liters;
      totalCostThisWeek += l.amount;
    }
  });
  const avgPriceThisWeek = totalVolumeThisWeek > 0 ? totalCostThisWeek / totalVolumeThisWeek : 0;

  // Calculate Weighted Average Price (Last Week)
  let totalVolumeLastWeek = 0;
  let totalCostLastWeek = 0;
  lastWeekLogs.forEach(l => {
     if (l.liters && l.amount) {
       totalVolumeLastWeek += l.liters;
       totalCostLastWeek += l.amount;
     }
  });
  const avgPriceLastWeek = totalVolumeLastWeek > 0 ? totalCostLastWeek / totalVolumeLastWeek : 0;

  // Trend Direction
  let trendDirection: 'up' | 'down' | 'stable' = 'stable';
  if (avgPriceThisWeek > avgPriceLastWeek * 1.01) trendDirection = 'up';
  else if (avgPriceThisWeek < avgPriceLastWeek * 0.99) trendDirection = 'down';

  // Potential Savings
  // Based on (Avg Price Paid This Week - Regional Min Price) * Total Volume
  // If user paid exactly min price, savings potential is 0.
  // If no regional min price is available, savings potential is 0.
  const potentialSavings = (regionalMinPrice > 0) ? (avgPriceThisWeek - regionalMinPrice) * totalVolumeThisWeek : 0;

  return {
    avgPriceThisWeek,
    avgPriceLastWeek,
    trendDirection,
    potentialSavings: Math.max(0, potentialSavings), // Can't be negative
    totalSpendThisWeek: totalCostThisWeek
  };
};

/**
 * Haversine formula to calculate distance between two coordinates in meters
 */
export const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371e3; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};