/**
 * Client for Fuel Brain Edge (shadow + consumer paths).
 */

import type { FuelBrainClassifyWeekInput, FuelBrainClassifyWeekResult } from '@roam/types/fuelBrain';
import { classifyFuelWeek } from '../utils/fuelBrainClassify';
import {
  FLEET_USE_FUEL_BRAIN,
  FUEL_BRAIN_SHADOW_COMPARE,
} from '../utils/fuelBrainFlags';

function brainBaseUrl(): string {
  return (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
}

function internalSecret(): string {
  // Browser cannot hold service secret — prefer local classify mirror for UI path.
  return import.meta.env.VITE_FUEL_BRAIN_INTERNAL_SECRET || '';
}

/**
 * Classify a driver/vehicle week. Uses local mirror (same algorithm as Edge).
 * When secret + URL available, optionally POSTs to Edge for parity logging.
 */
export async function classifyWeekForRecon(
  input: FuelBrainClassifyWeekInput,
): Promise<FuelBrainClassifyWeekResult> {
  const local = classifyFuelWeek(input);

  const secret = internalSecret();
  const base = brainBaseUrl();
  if (secret && base && (FLEET_USE_FUEL_BRAIN || FUEL_BRAIN_SHADOW_COMPARE)) {
    try {
      const res = await fetch(`${base}/functions/v1/fuel-brain/v1/internal/classify-week`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Fuel-Brain-Internal-Secret': secret,
        },
        body: JSON.stringify(input),
      });
      if (res.ok) {
        const data = await res.json();
        const remote = data.classification as FuelBrainClassifyWeekResult;
        if (FUEL_BRAIN_SHADOW_COMPARE) {
          const delta =
            Math.abs((remote.personalKm || 0) - local.personalKm) +
            Math.abs((remote.deadheadKm || 0) - local.deadheadKm) +
            Math.abs((remote.availableKm || 0) - local.availableKm);
          if (delta > 0.5) {
            console.warn('[FuelBrain] shadow mismatch', { local, remote, delta });
          } else {
            console.info('[FuelBrain] shadow parity ok', { personalKm: local.personalKm });
          }
        }
        if (FLEET_USE_FUEL_BRAIN) return remote;
      }
    } catch (e) {
      console.warn('[FuelBrain] Edge classify unavailable — using local mirror', e);
    }
  }

  return local;
}

export function shouldConsumeFuelBrain(): boolean {
  return FLEET_USE_FUEL_BRAIN;
}

export function shouldShadowCompareFuelBrain(): boolean {
  return FUEL_BRAIN_SHADOW_COMPARE && !FLEET_USE_FUEL_BRAIN;
}
