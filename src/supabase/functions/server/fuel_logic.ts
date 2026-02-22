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
  
  // Geofence Evidence
  geofenceMetadata?: {
    isInside: boolean;
    distanceMeters: number;
    timestamp: string;
    radiusAtTrigger: number;
    serverSideDistance?: number; // For anti-spoofing verification
  };
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
    rangeMin?: number,
    isCardTransaction?: boolean,
    frequencyThreshold?: number,
    // Phase 23: rolling average and configurable efficiency threshold
    rollingAvgEfficiency?: number,
    efficiencyThreshold?: number
  }
) {
  const { volume, tankCapacity, prevCumulative, distanceSinceAnchor, profileEfficiency, recentTxCount, isTopUp, isAnchor, rangeMin, isCardTransaction, frequencyThreshold, rollingAvgEfficiency, efficiencyThreshold } = params;
  
  const totalVolumeInCycle = prevCumulative + volume;
  // Phase 23: prefer rolling average over manufacturer spec when available
  const baseline = (rollingAvgEfficiency && rollingAvgEfficiency > 0) ? rollingAvgEfficiency : profileEfficiency;
  const actualKmPerLiter = distanceSinceAnchor > 0 ? distanceSinceAnchor / totalVolumeInCycle : 0;
  const efficiencyVariance = baseline > 0 ? (baseline - actualKmPerLiter) / baseline : 0;

  // Step 3.1: Tank Overfill Anomaly (102% Threshold)
  const OVERFILL_THRESHOLD = 1.02;
  if (tankCapacity > 0 && volume > (tankCapacity * OVERFILL_THRESHOLD)) {
    return { status: 'critical' as const, reason: 'Tank Overfill Anomaly', auditStatus: 'Flagged' as const };
  }

  // Step 3.2: Behavioral Integrity - High Frequency (card-only, configurable threshold)
  // Only flag card transactions; cash/reimbursement are exempt.
  // frequencyThreshold = total card swipes in 4h window that triggers alert (default 3).
  // recentTxCount excludes the current entry, so we compare >= (threshold - 1).
  const effectiveThreshold = frequencyThreshold ?? 3;
  if (isCardTransaction && recentTxCount >= (effectiveThreshold - 1)) {
    return { status: 'critical' as const, reason: 'High Transaction Frequency', auditStatus: 'Flagged' as const };
  }

  // Step 3.2: Behavioral Integrity - Fragmented Purchase (<15% tank)
  const isFragmented = tankCapacity > 0 && (volume / tankCapacity) < 0.15 && !isTopUp;
  if (isFragmented) {
    return { status: 'warning' as const, reason: 'Fragmented Purchase', auditStatus: 'Flagged' as const };
  }

  // Phase 4/5 logic (Efficiency) for Anchors
  // Phase 19 fix: skip efficiency checks entirely when distanceSinceAnchor is 0.
  // Historical entries without anchor metadata have distance=0, which causes:
  //   - actualKmPerLiter=0 → efficiencyVariance=1.0 → false "High Fuel Consumption"
  //   - 0 < rangeMin*0.5 → false "Range Suspicious"
  if (isAnchor && distanceSinceAnchor > 0) {
    // Phase 23: use configurable threshold (default 30%), skip if no baseline available
    const isHighConsumption = baseline > 0 && efficiencyVariance > (efficiencyThreshold ?? 0.30);
    const isRangeSuspicious = rangeMin && rangeMin > 0 && distanceSinceAnchor > 0 && distanceSinceAnchor < (rangeMin * 0.5) && (totalVolumeInCycle / tankCapacity) > 0.8;

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

/**
 * Phase 6: Weighted Audit Confidence Score
 * Calculates a confidence score (0-100) based on GPS, Signatures, and Physical data.
 */
export function calculateConfidenceScore(entry: any, station?: any) {
  let score = 0;
  const breakdown: Record<string, number> = {};

  // 1. Evidence Bridge: GPS Handshake (30 pts)
  if (entry.matchedStationId) {
    if (station?.status === 'verified') {
      breakdown.gps = 30;
      score += 30;
    } else {
      breakdown.gps = 15;
      score += 15;
    }
    
    // Proximity Bonus
    const matchDist = entry.metadata?.matchDistance || 999;
    if (matchDist < 50) {
      breakdown.gps_bonus = 5;
      score += 5;
    }
  } else {
    breakdown.gps = 0;
  }

  // 2. Cryptographic Handshake (25 pts)
  if (entry.signature) {
    breakdown.crypto = 25;
    score += 25;
  } else {
    breakdown.crypto = 0;
  }

  // 3. Physical Integrity (25 pts)
  let physicalScore = 0;
  if (entry.metadata?.integrityStatus === 'valid') {
    physicalScore += 15; // Base consistency
  } else if (entry.metadata?.integrityStatus === 'warning') {
    physicalScore += 5;
  }

  // Efficiency Bonus (for anchors)
  if (entry.metadata?.isAnchor && Math.abs(entry.metadata?.efficiencyVariance || 0) < 15) {
    physicalScore += 10;
  } else if (!entry.metadata?.isAnchor && entry.odometer > 0) {
    physicalScore += 5; // Has odometer
  }
  
  breakdown.physical = Math.min(25, physicalScore);
  score += breakdown.physical;

  // 4. Behavioral Integrity (20 pts)
  let behavioralScore = 0;
  if (!entry.metadata?.isHighFrequency) behavioralScore += 10;
  if (!entry.metadata?.isFragmented) behavioralScore += 10;
  
  breakdown.behavioral = behavioralScore;
  score += behavioralScore;

  // Final normalization
  const finalScore = Math.min(100, score);
  
  return {
    score: finalScore,
    breakdown,
    isHighlyTrusted: finalScore >= 90,
    requiresReview: finalScore < 70
  };
}

/**
 * Phase 7: Predictive Consumption Engine
 * Calculates expected anchor date and identifies predictive leakage.
 */
export function calculatePredictiveMetrics(params: {
    vehicleId: string,
    currentCumulative: number,
    tankCapacity: number,
    profileEfficiency: number,
    dailyAvgDistance?: number
}) {
    const { currentCumulative, tankCapacity, profileEfficiency, dailyAvgDistance = 150 } = params;
    
    if (tankCapacity <= 0 || profileEfficiency <= 0) return null;

    const remainingCapacity = Math.max(0, tankCapacity - currentCumulative);
    const predictedRemainingKm = remainingCapacity * profileEfficiency;
    
    // Calculate expected anchor date (when tank hits 100%)
    const daysUntilAnchor = dailyAvgDistance > 0 ? predictedRemainingKm / dailyAvgDistance : 0;
    const expectedAnchorDate = new Date();
    expectedAnchorDate.setDate(expectedAnchorDate.getDate() + daysUntilAnchor);

    return {
        remainingCapacity,
        predictedRemainingKm,
        daysUntilAnchor: Math.round(daysUntilAnchor),
        expectedAnchorDate: expectedAnchorDate.toISOString().split('T')[0],
        utilizationPercentage: (currentCumulative / tankCapacity) * 100
    };
}

/**
 * Phase 7: Behavioral Leakage Alert Logic
 * Detects hidden leakage by identifying efficiency gaps during "Floating" states.
 */
export function detectPredictiveLeakage(params: {
    actualEfficiency: number,
    profileEfficiency: number,
    utilization: number,
    isAnchor: boolean,
    // Phase 23: rolling average for more accurate leakage detection
    rollingAvgEfficiency?: number
}) {
    const { actualEfficiency, profileEfficiency, utilization, isAnchor, rollingAvgEfficiency } = params;
    
    // Phase 23: prefer rolling average over manufacturer spec when available
    const baseline = (rollingAvgEfficiency && rollingAvgEfficiency > 0) ? rollingAvgEfficiency : profileEfficiency;
    
    if (baseline <= 0 || actualEfficiency <= 0) return null;

    const variance = (baseline - actualEfficiency) / baseline;
    
    // Leakage Alert Thresholds:
    // 1. If at an Anchor, we have high confidence in the variance.
    // 2. If Floating, we only flag if the variance is extreme (>35%) OR utilization is high.
    
    let leakageRisk: 'low' | 'medium' | 'high' = 'low';
    let alertReason = null;

    if (isAnchor) {
        if (variance > 0.25) {
            leakageRisk = 'high';
            alertReason = 'Confirmed Operational Leakage (Efficiency Gap)';
        } else if (variance > 0.15) {
            leakageRisk = 'medium';
            alertReason = 'Elevated Consumption Variance';
        }
    } else {
        if (variance > 0.40) {
            leakageRisk = 'high';
            alertReason = 'Predictive Leakage Alert: Extreme Mid-Cycle Drift';
        } else if (variance > 0.20 && utilization > 70) {
            leakageRisk = 'medium';
            alertReason = 'Predictive Warning: Utilization/Efficiency Mismatch';
        }
    }

    return {
        variancePercentage: Math.round(variance * 100),
        leakageRisk,
        alertReason,
        isAlertTriggered: leakageRisk !== 'low'
    };
}

/**
 * Phase 17: Rolling Efficiency Result Type
 * Returned by both the real-time and batch rolling average functions.
 */
export interface RollingEfficiencyResult {
    avgKmPerLiter: number;
    window: '30d' | '60d' | 'all';
    entryCount: number;
    totalDistance: number;
    totalFuel: number;
}

/**
 * Phase 17 (Step 17.1–17.4): Real-Time Rolling Average Efficiency
 * 
 * Computes a vehicle's actual average km/L from its own historical fuel entries.
 * Used during real-time entry scoring (fuel_entry_post.tsx, fuel_controller.tsx).
 * 
 * Logic:
 *  1. Query fuel entries for the vehicle within a 30-day window (ending at asOfDate).
 *  2. Only include entries with valid odometer (>0) AND liters (>0).
 *  3. Exclude entries that are currently flagged (to avoid anomalies polluting the baseline).
 *  4. Need at least 3 valid entries for a reliable average.
 *  5. If fewer than 3 in 30 days, expand to 60 days.
 *  6. If still fewer than 3, return null (caller should skip the efficiency check).
 *  7. Average = totalDistance / totalFuel across the window.
 */
export async function calculateRollingEfficiency(
    vehicleId: string,
    asOfDate?: string
): Promise<RollingEfficiencyResult | null> {
    const refDate = asOfDate ? new Date(asOfDate) : new Date();

    // Try 30-day window first
    const result30 = await _queryWindowedEntries(vehicleId, refDate, 30);
    if (result30 && result30.entryCount >= 3) {
        return { ...result30, window: '30d' };
    }

    // Fallback: 60-day window
    const result60 = await _queryWindowedEntries(vehicleId, refDate, 60);
    if (result60 && result60.entryCount >= 3) {
        return { ...result60, window: '60d' };
    }

    // Insufficient data — caller should skip efficiency check
    console.log(`[RollingEfficiency] Vehicle ${vehicleId}: insufficient data (${result60?.entryCount ?? 0} entries in 60d). Skipping efficiency check.`);
    return null;
}

/**
 * Internal helper: queries fuel entries within a day-window and computes the average.
 */
async function _queryWindowedEntries(
    vehicleId: string,
    refDate: Date,
    windowDays: number
): Promise<{ avgKmPerLiter: number; entryCount: number; totalDistance: number; totalFuel: number } | null> {
    const windowStart = new Date(refDate);
    windowStart.setDate(windowStart.getDate() - windowDays);
    const startStr = windowStart.toISOString().split('T')[0];
    const endStr = refDate.toISOString().split('T')[0];

    const { data, error } = await supabase
        .from("kv_store_37f42386")
        .select("value")
        .like("key", "fuel_entry:%")
        .eq("value->>vehicleId", vehicleId)
        .gte("value->>date", startStr)
        .lte("value->>date", endStr)
        .order("value->>odometer", { ascending: true });

    if (error) {
        console.error(`[RollingEfficiency] Query error for ${vehicleId} (${windowDays}d):`, error);
        return null;
    }

    // Filter: must have valid odometer AND liters
    // Note: we intentionally include flagged entries so the baseline stays stable
    // (excluding them causes a death spiral where each recalculate raises the average)
    const valid = (data || [])
        .map(d => d.value)
        .filter((e: any) => {
            const odo = Number(e.odometer) || 0;
            const liters = Number(e.liters) || 0;
            return odo > 0 && liters > 0;
        });

    if (valid.length < 3) return { avgKmPerLiter: 0, entryCount: valid.length, totalDistance: 0, totalFuel: 0 };

    // Sort by odometer ascending (should already be, but ensure it)
    valid.sort((a: any, b: any) => (Number(a.odometer) || 0) - (Number(b.odometer) || 0));

    const firstOdo = Number(valid[0].odometer);
    const lastOdo = Number(valid[valid.length - 1].odometer);
    const totalDistance = lastOdo - firstOdo;
    // Exclude the first entry's liters — that fuel was consumed BEFORE the
    // distance window (firstOdo → lastOdo). This is the standard fill-up method.
    const totalFuel = valid.slice(1).reduce((sum: number, e: any) => sum + (Number(e.liters) || 0), 0);

    if (totalDistance <= 0 || totalFuel <= 0) {
        return { avgKmPerLiter: 0, entryCount: valid.length, totalDistance: 0, totalFuel: 0 };
    }

    const avgKmPerLiter = Number((totalDistance / totalFuel).toFixed(2));
    return { avgKmPerLiter, entryCount: valid.length, totalDistance, totalFuel };
}

/**
 * Phase 17 (Step 17.5): Batch Rolling Average Efficiency
 * 
 * Computes a vehicle's average km/L from a pre-loaded array of entries.
 * Used by the recalculate endpoint to avoid N+1 DB queries.
 * 
 * Same filtering logic (odometer >0, liters >0), minimum 3 entries.
 * Operates on ALL provided entries (no time window — the recalculate processes
 * the full history, so the overall average is the most stable baseline).
 *
 * IMPORTANT: Does NOT exclude flagged entries. The baseline must be stable
 * across repeated recalculations — excluding flags creates a death spiral
 * where the average rises each time, flagging progressively more entries.
 */
export function calculateRollingEfficiencyBatch(
    entries: any[]
): RollingEfficiencyResult | null {
    // Filter: must have valid odometer AND liters
    // Note: we intentionally include flagged entries so the baseline stays stable
    // (excluding them causes a death spiral where each recalculate raises the average)
    const valid = entries.filter((e: any) => {
        const odo = Number(e.odometer) || 0;
        const liters = Number(e.liters) || 0;
        return odo > 0 && liters > 0;
    });

    if (valid.length < 3) {
        console.log(`[RollingEfficiencyBatch] Insufficient data: ${valid.length} valid entries (need 3). Skipping.`);
        return null;
    }

    // Sort by odometer ascending (should already be, but ensure it)
    valid.sort((a: any, b: any) => (Number(a.odometer) || 0) - (Number(b.odometer) || 0));

    const firstOdo = Number(valid[0].odometer);
    const lastOdo = Number(valid[valid.length - 1].odometer);
    const totalDistance = lastOdo - firstOdo;
    // Exclude the first entry's liters — that fuel was consumed BEFORE the
    // distance window (firstOdo → lastOdo). This is the standard fill-up method.
    const totalFuel = valid.slice(1).reduce((sum: number, e: any) => sum + (Number(e.liters) || 0), 0);

    if (totalDistance <= 0 || totalFuel <= 0) {
        return { avgKmPerLiter: 0, entryCount: valid.length, totalDistance: 0, totalFuel: 0 };
    }

    const avgKmPerLiter = Number((totalDistance / totalFuel).toFixed(2));
    return { avgKmPerLiter, entryCount: valid.length, totalDistance, totalFuel };
}