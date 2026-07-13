/**
 * Fuel Brain classifier — locked priority:
 * 1. Declared personal / off-duty sessions → Personal (high)
 * 2. Platform trip overlap → Ride Share (high)
 * 3. Company Misc / Maintenance → Company Ops (high)
 * 4. Deadhead rules on remaining residual → Deadhead (med)
 * 5. Else → Unknown (low) — NEVER auto-Personal
 *
 * Mirrored in supabase/functions/fuel-brain/classify.ts — keep in sync.
 */

import type {
  FuelBrainClassifyWeekInput,
  FuelBrainClassifyWeekResult,
} from '@roam/types/fuelBrain';

function sessionDeclaredKm(
  sessions: FuelBrainClassifyWeekInput['sessions'],
  modes: Array<'personal' | 'off_duty'>,
): number {
  let km = 0;
  for (const s of sessions) {
    if (!modes.includes(s.mode as 'personal' | 'off_duty')) continue;
    const start = Number(s.startOdo);
    const end = Number(s.endOdo);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      km += end - start;
    }
  }
  return Math.max(0, km);
}

export function classifyFuelWeek(
  input: FuelBrainClassifyWeekInput,
): FuelBrainClassifyWeekResult {
  const totalOdo = Math.max(0, Number(input.totalOdometerKm) || 0);
  const tripKm = Math.max(0, Number(input.tripRideshareKm) || 0);
  const companyOpsKm = Math.max(0, Number(input.companyOpsKm) || 0);

  const personalFromSessions = sessionDeclaredKm(input.sessions, ['personal']);
  const offDutyFromSessions = sessionDeclaredKm(input.sessions, ['off_duty']);
  // Off-duty counts toward personal purpose for money splits
  let personalKm = personalFromSessions + offDutyFromSessions;

  // Cap personal to remaining after trip + company when odo known
  if (totalOdo > 0) {
    const maxPersonal = Math.max(0, totalOdo - tripKm - companyOpsKm);
    personalKm = Math.min(personalKm, maxPersonal);
  }

  const afterKnown = totalOdo > 0
    ? Math.max(0, totalOdo - tripKm - companyOpsKm - personalKm)
    : 0;

  const deadheadHint = Math.max(0, Number(input.deadheadHintKm) || 0);
  const deadheadKm = Math.min(deadheadHint, afterKnown);
  const unknownKm = Math.max(0, afterKnown - deadheadKm);

  const unknownPct = totalOdo > 0 ? (unknownKm / totalOdo) * 100 : 0;

  return {
    rideShareKm: tripKm,
    personalKm,
    offDutyKm: offDutyFromSessions,
    companyOpsKm,
    deadheadKm,
    unknownKm,
    totalOdometerKm: totalOdo,
    confidence: {
      rideShare: tripKm > 0 ? 'high' : 'low',
      personal: personalKm > 0 ? 'high' : 'low',
      deadhead: deadheadKm > 0 ? 'medium' : 'low',
      unknown: unknownKm > 0 ? 'low' : 'high',
    },
    unknownPct: Number(unknownPct.toFixed(2)),
    method: 'fuel_brain_v1',
  };
}
