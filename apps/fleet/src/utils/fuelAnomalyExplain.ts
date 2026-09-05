/**
 * Phase 5 — plain-English anomaly explanations for cycle exceptions.
 */
import type { FuelCycle } from '../types/fuel';

export function explainCycleAnomaly(cycle: FuelCycle, fleetMedianKmPerL?: number): string {
  const parts: string[] = [];
  if (cycle.status === 'Anomaly') {
    parts.push('This cycle was flagged as an anomaly by integrity checks.');
  }
  if (typeof cycle.efficiency === 'number' && cycle.efficiency > 0 && cycle.efficiency < 8) {
    parts.push(
      `Efficiency is ${cycle.efficiency.toFixed(1)} km/L, below the 8 km/L review floor.`,
    );
  }
  if (
    fleetMedianKmPerL &&
    typeof cycle.efficiency === 'number' &&
    cycle.efficiency > 0 &&
    cycle.efficiency < fleetMedianKmPerL * 0.53
  ) {
    const pct = Math.round((1 - cycle.efficiency / fleetMedianKmPerL) * 100);
    parts.push(
      `This cycle is about ${pct}% below this vehicle's recent median (${fleetMedianKmPerL.toFixed(1)} km/L).`,
    );
  }
  if (
    typeof cycle.startOdometer === 'number' &&
    typeof cycle.endOdometer === 'number' &&
    cycle.endOdometer <= cycle.startOdometer
  ) {
    parts.push('Odometer did not advance between capacity closes — distance may be incomplete.');
  }
  if (cycle.isChainOrigin) {
    parts.push('First measured cycle after the opening capacity-close anchor.');
  }
  return parts.length ? parts.join(' ') : 'No anomaly explanation available.';
}
