/**
 * Fuel Brain classifier v2 — fully automated residual Personal:
 * Available = Odo − RideShare − CompanyOps
 * Deadhead = min(Available, max(hint, Available × industryFallbackPct%))
 * Personal = Available − Deadhead
 *
 * Mirrored in supabase/functions/fuel-brain/classify.ts — keep in sync.
 */

import type {
  FuelBrainClassifyWeekInput,
  FuelBrainClassifyWeekResult,
} from '@roam/types/fuelBrain';
import {
  applyDeadheadFloor,
  DEFAULT_INDUSTRY_FALLBACK_PCT,
} from './deadheadHintForBrain';

export function classifyFuelWeek(
  input: FuelBrainClassifyWeekInput,
): FuelBrainClassifyWeekResult {
  const totalOdo = Math.max(0, Number(input.totalOdometerKm) || 0);
  const tripKm = Math.max(0, Number(input.tripRideshareKm) || 0);
  const companyOpsKm = Math.max(0, Number(input.companyOpsKm) || 0);

  const availableKm =
    totalOdo > 0 ? Math.max(0, totalOdo - tripKm - companyOpsKm) : 0;

  const industryPct =
    Number(input.industryFallbackPct) ||
    Number(input.policy?.industryFallbackPct) ||
    DEFAULT_INDUSTRY_FALLBACK_PCT;

  const deadheadHint = Math.max(0, Number(input.deadheadHintKm) || 0);
  const deadheadKm = applyDeadheadFloor(deadheadHint, availableKm, industryPct);
  const personalKm = Math.max(0, availableKm - deadheadKm);

  return {
    rideShareKm: tripKm,
    personalKm,
    companyOpsKm,
    deadheadKm,
    totalOdometerKm: totalOdo,
    availableKm,
    confidence: {
      rideShare: tripKm > 0 ? 'high' : 'low',
      personal: personalKm > 0 ? 'medium' : 'high',
      deadhead: deadheadKm > 0 ? 'medium' : 'low',
    },
    method: 'fuel_brain_v2',
  };
}
