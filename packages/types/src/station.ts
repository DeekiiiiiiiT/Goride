export type LocationStatus = 'verified' | 'unverified' | 'learnt' | 'anomaly';

export interface StationAlias {
  id: string;
  lat: number;
  lng: number;
  radius?: number; // Optional radius override for this specific alias
  label: string;
  addedAt: string;
}

export interface StationProfile {
  id: string; // Hash of normalized Name + Address
  name: string;
  brand: string;
  address: string;
  city?: string;
  parish?: string;
  country?: string;
  location: {
    lat: number;
    lng: number;
    radius?: number; // Adaptive spatial boundary in meters
    accuracy?: number;
  };
  plusCode?: string; // Open Location Code (Google Plus Code) for high-precision location
  geofenceRadius?: number; // Configurable geofence radius in meters
  isPreferred: boolean;
  stats: StationStats;
  
  // Phase 6: GPS Aliasing & Integrity
  aliases?: StationAlias[];
  masterPinEvidence?: {
    lastSyncedAt: string;
    sourceTransactionId: string;
    coordinates: { lat: number; lng: number };
  };

  // Phase 10: Enriched Metadata
  amenities: string[];
  dataSource: 'log' | 'manual' | 'import';
  category?: 'fuel' | 'non_fuel';
  contactInfo: {
    phone?: string;
    website?: string;
  };
  status: LocationStatus;
  operationalStatus?: 'active' | 'inactive' | 'review';
}

export interface StationStats {
  avgPrice: number;
  lastPrice: number;
  priceTrend: 'Up' | 'Down' | 'Stable';
  totalVisits: number;
  rating: number; // 0-5 stars
  lastUpdated: string; // ISO Date
}

export interface StationAnalyticsContextType {
  stations: StationProfile[];
  regionalStats: {
    minPrice: number;
    maxPrice: number;
    avgPrice: number;
  };
  loading: boolean;
  togglePreferred: (id: string) => void;
  updateStationDetails?: (id: string, details: Partial<StationProfile>) => void;
}

export interface StationOverride {
  name?: string;
  address?: string;
  brand?: string;
  city?: string;
  parish?: string;
  country?: string;
  plusCode?: string; // Open Location Code (Google Plus Code)
  geofenceRadius?: number; // Configurable geofence radius in meters
  location?: {
    lat: number;
    lng: number;
    accuracy?: number;
  };
  
  // Phase 10: Enriched Metadata Overrides
  amenities?: string[];
  dataSource?: 'log' | 'manual' | 'import';
  category?: 'fuel' | 'non_fuel';
  contactInfo?: {
    phone?: string;
    website?: string;
  };
  status?: LocationStatus;
  operationalStatus?: 'active' | 'inactive' | 'review';
  
  // Optional: Initial Stats from Import
  initialStats?: {
    avgPrice?: number;
    lastPrice?: number;
    totalVisits?: number;
    lastUpdated?: string;
  };
}