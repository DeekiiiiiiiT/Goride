import * as kv from "./kv_store.tsx";
import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

/**
 * Step 1.1: Metadata Schema Definition
 */
export interface FuelEntryMetadata {
  isSoftAnchor?: boolean;
  isHardAnchor?: boolean;
  cumulativeVolumeAtEntry: number;
  tankUtilizationPercentage: number;
  volumeContributed: number;
  excessVolume?: number;
  distanceSinceAnchor: number;
  actualKmPerLiter: number;
  profileKmPerLiter: number;
  efficiencyVariance: number;
  integrityStatus: 'valid' | 'warning' | 'critical';
  anomalyReason?: string;
  auditStatus: 'Clear' | 'Flagged' | 'Observing' | 'Auto-Resolved' | 'Resolved';
  cycleId: string;
  [key: string]: any;
}

/**
 * Step 1.3: Audit Trail Query Helpers
 * Fetches the most recent anchor (Hard or Soft) for a vehicle.
 */
export async function getLastAnchor(vehicleId: string) {
  const { data, error } = await supabase
    .from("kv_store_37f42386")
    .select("value")
    .like("key", "fuel_entry:%")
    .eq("value->>vehicleId", vehicleId)
    .or("value->metadata->>isSoftAnchor.eq.true,value->metadata->>isAnchor.eq.true,value->metadata->>isFullTank.eq.true")
    .order("value->>date", { ascending: false })
    .limit(1);

  if (error) {
    console.error("[getLastAnchor] Error:", error);
    return null;
  }

  return data?.[0]?.value || null;
}

/**
 * Fetches all entries since the last anchor date.
 */
export async function getEntriesSinceLastAnchor(vehicleId: string, anchorDate: string | null) {
  let query = supabase
    .from("kv_store_37f42386")
    .select("value")
    .like("key", "fuel_entry:%")
    .eq("value->>vehicleId", vehicleId);

  if (anchorDate) {
    query = query.gt("value->>date", anchorDate);
  }

  const { data, error } = await query.order("value->>date", { ascending: true });

  if (error) {
    console.error("[getEntriesSinceLastAnchor] Error:", error);
    return [];
  }

  return (data || []).map(d => d.value);
}

/**
 * Step 1.2: Vehicle Profile Configuration Helper
 * Ensures we get the standard immutable constants from a vehicle object.
 */
export function getVehicleBaselines(vehicle: any) {
  return {
    tankCapacity: Number(vehicle?.specifications?.tankCapacity) || Number(vehicle?.fuelSettings?.tankCapacity) || 0,
    baselineEfficiency: Number(vehicle?.specifications?.fuelEconomy) || Number(vehicle?.fuelSettings?.efficiencyCity) || 0,
    rangeMin: Number(vehicle?.specifications?.estimatedRangeMin) || 0
  };
}

/**
 * Step 3.1 & 3.2: Behavioral & Physical Integrity Logic
 * Centralized logic for flagging anomalies.
 */
export function calculateIntegrity(
  params: {
    volume: number,
    tankCapacity: number,
    prevCumulative: number,
    distanceSinceAnchor: number,
    profileEfficiency: number,
    recentTxCount: number,
    isTopUp?: boolean,
    isAnchor?: boolean,
    rangeMin?: number
  }
) {
  const { volume, tankCapacity, prevCumulative, distanceSinceAnchor, profileEfficiency, recentTxCount, isTopUp, isAnchor, rangeMin } = params;
  
  const totalVolumeInCycle = prevCumulative + volume;
  const actualKmPerLiter = distanceSinceAnchor > 0 ? distanceSinceAnchor / totalVolumeInCycle : 0;
  const efficiencyVariance = profileEfficiency > 0 ? (profileEfficiency - actualKmPerLiter) / profileEfficiency : 0;

  // Step 3.1: Tank Overfill Anomaly (102% Threshold)
  const OVERFILL_THRESHOLD = 1.02;
  if (tankCapacity > 0 && volume > (tankCapacity * OVERFILL_THRESHOLD)) {
    return { status: 'critical' as const, reason: 'Tank Overfill Anomaly', auditStatus: 'Flagged' as const };
  }

  // Step 3.2: Behavioral Integrity - High Frequency (2+ in 4h)
  if (recentTxCount >= 1) {
    return { status: 'critical' as const, reason: 'High Transaction Frequency', auditStatus: 'Flagged' as const };
  }

  // Step 3.2: Behavioral Integrity - Fragmented Purchase (<15% tank)
  const isFragmented = tankCapacity > 0 && (volume / tankCapacity) < 0.15 && !isTopUp;
  if (isFragmented) {
    return { status: 'warning' as const, reason: 'Fragmented Purchase', auditStatus: 'Flagged' as const };
  }

  // Phase 4/5 logic (Efficiency) for Anchors
  if (isAnchor) {
    const isHighConsumption = efficiencyVariance > 0.25; 
    const isRangeSuspicious = rangeMin && rangeMin > 0 && distanceSinceAnchor < (rangeMin * 0.5) && (totalVolumeInCycle / tankCapacity) > 0.8;

    if (isHighConsumption || isRangeSuspicious) {
      return { status: 'critical' as const, reason: 'High Fuel Consumption', auditStatus: 'Flagged' as const };
    }
  }

  // Warning: Approaching Capacity
  if (tankCapacity > 0 && totalVolumeInCycle > (tankCapacity * 0.85)) {
    return { status: 'warning' as const, reason: 'Approaching Capacity', auditStatus: 'Observing' as const };
  }

  return { status: 'valid' as const, reason: null, auditStatus: 'Clear' as const };
}

/**
 * Step 4.1: Financial Integrity Logic
 * Checks for price anomalies compared to organizational/regional benchmarks.
 */
export function calculateFinancialVariance(params: {
  pricePerLiter: number,
  avgPricePerLiter: number,
  threshold?: number
}) {
  const { pricePerLiter, avgPricePerLiter, threshold = 0.15 } = params;
  if (avgPricePerLiter <= 0) return 0;
  
  const variance = (pricePerLiter - avgPricePerLiter) / avgPricePerLiter;
  return Number(variance.toFixed(4));
}

/**
 * Step 4.2: Audit Summary Aggregator
 * Processes a collection of entries to generate a high-level integrity report.
 */
export function generateAuditSummary(entries: any[], vehicleId?: string) {
  const filtered = vehicleId ? entries.filter(e => e.vehicleId === vehicleId) : entries;
  
  const stats = {
    totalLiters: 0,
    totalCost: 0,
    totalDistance: 0,
    flaggedTransactions: 0,
    criticalAnomalies: 0,
    healedTransactions: 0,
    avgEfficiency: 0,
    costPerKm: 0,
    lastOdometer: 0,
    firstOdometer: 0,
    vehicleId: vehicleId || 'fleet-wide'
  };

  if (filtered.length === 0) return stats;

  const sorted = [...filtered].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  stats.firstOdometer = Number(sorted[0].odometer) || 0;
  stats.lastOdometer = Number(sorted[sorted.length - 1].odometer) || 0;
  stats.totalDistance = stats.lastOdometer - stats.firstOdometer;

  filtered.forEach(e => {
    stats.totalLiters += Number(e.liters) || 0;
    stats.totalCost += Number(e.amount) || 0;
    
    if (e.isFlagged) stats.criticalAnomalies++;
    if (e.auditStatus === 'Flagged') stats.flaggedTransactions++;
    if (e.metadata?.isHealed) stats.healedTransactions++;
  });

  if (stats.totalLiters > 0 && stats.totalDistance > 0) {
    stats.avgEfficiency = Number((stats.totalDistance / stats.totalLiters).toFixed(2));
  }
  
  if (stats.totalDistance > 0) {
    stats.costPerKm = Number((stats.totalCost / stats.totalDistance).toFixed(2));
  }

  return stats;
}

/**
 * Step 5.1: Odometer Gap & Regression Audit
 * Checks for missing logs or data entry errors in the odometer sequence.
 */
export function auditOdometerSequence(params: {
  currentOdo: number,
  prevOdo: number,
  maxExpectedDistance: number // e.g., 2x vehicle range
}) {
  const { currentOdo, prevOdo, maxExpectedDistance } = params;
  
  if (prevOdo <= 0) return { status: 'valid' as const, reason: null };

  // Regression check
  if (currentOdo < prevOdo) {
    return { status: 'critical' as const, reason: 'Odometer Regression', auditStatus: 'Flagged' as const };
  }

  // Gap check
  const distance = currentOdo - prevOdo;
  if (maxExpectedDistance > 0 && distance > maxExpectedDistance) {
    return { status: 'warning' as const, reason: 'Odometer Gap Detected', auditStatus: 'Flagged' as const };
  }

  // Stagnation check (Same odo for different dates)
  if (currentOdo === prevOdo && distance === 0) {
    return { status: 'warning' as const, reason: 'Odometer Stagnation', auditStatus: 'Flagged' as const };
  }

  return { status: 'valid' as const, reason: null };
}
