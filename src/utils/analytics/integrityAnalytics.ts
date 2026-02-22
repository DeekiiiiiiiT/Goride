import { Trip } from '../../types/data';
import { formatDateJM } from '../csv-helper';

export interface IntegrityMetrics {
  totalTrips: number;
  instantSuccessRate: number;
  autoHealedRate: number;
  manualOverrideRate: number;
  failureRate: number;
  avgResolutionLatency: number; // in seconds
  totalFailures: number;
  resolutionDistribution: {
    instant: number;
    background: number;
    manual: number;
    pending: number;
  };
}

export interface DeadZone {
  lat: number;
  lng: number;
  count: number;
  errors: string[];
}

/**
 * Calculates data integrity metrics from a set of trips.
 */
export function calculateAccuracyMetrics(trips: Trip[]): IntegrityMetrics {
  const total = trips.length;
  if (total === 0) {
    return {
      totalTrips: 0,
      instantSuccessRate: 0,
      autoHealedRate: 0,
      manualOverrideRate: 0,
      failureRate: 0,
      avgResolutionLatency: 0,
      totalFailures: 0,
      resolutionDistribution: { instant: 0, background: 0, manual: 0, pending: 0 }
    };
  }

  const dist = {
    instant: 0,
    background: 0,
    manual: 0,
    pending: 0
  };

  let totalLatency = 0;
  let latencyCount = 0;

  trips.forEach(trip => {
    const method = trip.resolutionMethod || 'pending';
    dist[method as keyof typeof dist]++;

    if (trip.resolutionTimestamp && trip.requestTime) {
      const start = new Date(trip.requestTime).getTime();
      const end = new Date(trip.resolutionTimestamp).getTime();
      const latency = (end - start) / 1000;
      if (latency > 0) {
        totalLatency += latency;
        latencyCount++;
      }
    }
  });

  return {
    totalTrips: total,
    instantSuccessRate: (dist.instant / total) * 100,
    autoHealedRate: (dist.background / total) * 100,
    manualOverrideRate: (dist.manual / total) * 100,
    failureRate: (dist.pending / total) * 100,
    avgResolutionLatency: latencyCount > 0 ? totalLatency / latencyCount : 0,
    totalFailures: dist.pending,
    resolutionDistribution: dist
  };
}

/**
 * Identifies geographic clusters where geocoding frequently fails.
 */
export function identifyDeadZones(trips: Trip[]): DeadZone[] {
  const failedTrips = trips.filter(t => t.resolutionMethod === 'pending' || t.geocodeError);
  const clusters: Record<string, DeadZone> = {};

  failedTrips.forEach(trip => {
    const lat = trip.startLat || 0;
    const lng = trip.startLng || 0;
    
    // Round to 3 decimal places (~110m accuracy) for clustering
    const clusterKey = `${lat.toFixed(3)}_${lng.toFixed(3)}`;
    
    if (!clusters[clusterKey]) {
      clusters[clusterKey] = {
        lat: Number(lat.toFixed(3)),
        lng: Number(lng.toFixed(3)),
        count: 0,
        errors: []
      };
    }
    
    clusters[clusterKey].count++;
    if (trip.geocodeError && !clusters[clusterKey].errors.includes(trip.geocodeError)) {
      clusters[clusterKey].errors.push(trip.geocodeError);
    }
  });

  return Object.values(clusters).sort((a, b) => b.count - a.count);
}

/**
 * Generates a CSV string for data integrity export.
 */
export function generateIntegrityCSV(trips: Trip[]): string {
  const headers = [
    'Trip ID',
    'Date',
    'Route',
    'Status',
    'Method',
    'Resolution Latency (s)',
    'Geocode Error',
    'Latitude',
    'Longitude'
  ];

  const rows = trips.map(trip => {
    let latency = '';
    if (trip.resolutionTimestamp && trip.requestTime) {
      const start = new Date(trip.requestTime).getTime();
      const end = new Date(trip.resolutionTimestamp).getTime();
      latency = ((end - start) / 1000).toFixed(2);
    }

    return [
      trip.id,
      formatDateJM(trip.date),
      trip.routeId,
      trip.status,
      trip.resolutionMethod || 'pending',
      latency,
      trip.geocodeError || '',
      trip.startLat,
      trip.startLng
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}