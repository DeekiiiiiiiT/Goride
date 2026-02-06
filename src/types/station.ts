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
  };
  isPreferred: boolean;
  stats: StationStats;
  
  // Phase 10: Enriched Metadata
  amenities: string[];
  dataSource: 'log' | 'manual' | 'import';
  category?: 'fuel' | 'non_fuel';
  contactInfo: {
    phone?: string;
    website?: string;
  };
  status: 'active' | 'inactive' | 'review';
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
  location?: {
    lat: number;
    lng: number;
  };
  
  // Phase 10: Enriched Metadata Overrides
  amenities?: string[];
  dataSource?: 'log' | 'manual' | 'import';
  category?: 'fuel' | 'non_fuel';
  contactInfo?: {
    phone?: string;
    website?: string;
  };
  status?: 'active' | 'inactive' | 'review';
  
  // Optional: Initial Stats from Import
  initialStats?: {
    avgPrice?: number;
    lastPrice?: number;
    totalVisits?: number;
    lastUpdated?: string;
  };
}
