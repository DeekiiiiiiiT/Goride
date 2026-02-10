import { FuelEntry } from '../types/fuel';
import { StationProfile, StationStats } from '../types/station';
import { subDays, isAfter } from 'date-fns';

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

export const aggregateStations = (logs: FuelEntry[]): StationProfile[] => {
  const stationMap = new Map<string, {
    name: string;
    address: string;
    brand: string;
    entries: FuelEntry[];
  }>();

  // 1. Group logs by normalized location
  logs.forEach(log => {
    if (!log.location) return;
    
    // Skip logs with no meaningful location data
    if (log.location === 'Unknown' || log.location === 'Manual Entry') return;

    const name = normalizeStationName(log.location);
    const address = log.stationAddress || 'Unknown Address';
    const id = generateStationId(name, address);

    if (!stationMap.has(id)) {
      stationMap.set(id, {
        name,
        address,
        brand: inferBrandFromName(name),
        entries: []
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
    
    // Deterministic pseudo-random offset based on ID for consistent demo mapping
    const hashVal = parseInt(id.replace('st_', ''), 16);
    lat += ((hashVal % 100) - 50) * 0.001;
    lng += ((hashVal % 100) - 50) * 0.001;

    return {
      id,
      name: data.name,
      address: data.address,
      brand: data.brand,
      location: { lat, lng },
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
  const activeStations = stations.filter(s => s.stats.lastPrice > 0);
  if (activeStations.length === 0) return { minPrice: 0, maxPrice: 0, avgPrice: 0 };

  const prices = activeStations.map(s => s.stats.lastPrice);
  return {
    minPrice: Math.min(...prices),
    maxPrice: Math.max(...prices),
    avgPrice: prices.reduce((a, b) => a + b, 0) / prices.length
  };
};

export const calculateDashboardKPIs = (logs: FuelEntry[], regionalMinPrice: number) => {
  const now = new Date();
  const oneWeekAgo = subDays(now, 7);
  const twoWeeksAgo = subDays(now, 14);

  // Filter logs for periods
  const thisWeekLogs = logs.filter(l => isAfter(new Date(l.date), oneWeekAgo));
  const lastWeekLogs = logs.filter(l => {
    const d = new Date(l.date);
    return isAfter(d, twoWeeksAgo) && !isAfter(d, oneWeekAgo);
  });

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
