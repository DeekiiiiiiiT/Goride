/**
 * One classifier. The 35% figure is a benchmark, not a floor.
 * Personal is not the remainder — that remainder is unattributed.
 */

export const INDUSTRY_DEADHEAD_BENCHMARK_PCT = 35;

export interface ClassifyWeekInput {
  totalOdometerKm: number;
  tripRideshareKm: number;
  companyOpsKm: number;
  deadheadHintKm?: number;
  /** Ignored for billing. Kept so older callers still compile. */
  industryFallbackPct?: number;
  driverId?: string;
  vehicleId?: string;
  weekStart?: string;
  weekEnd?: string;
  policy?: { industryFallbackPct?: number };
}

export interface ClassifyWeekResult {
  rideShareKm: number;
  personalKm: number;
  companyOpsKm: number;
  deadheadKm: number;
  unattributedKm: number;
  totalOdometerKm: number;
  availableKm: number;
  industryBenchmarkPct: number;
  confidence: {
    rideShare: 'high' | 'medium' | 'low';
    personal: 'high' | 'medium' | 'low';
    deadhead: 'high' | 'medium' | 'low';
  };
  method: 'fuel_brain_v2';
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function classifyFuelWeek(input: ClassifyWeekInput): ClassifyWeekResult {
  const totalOdo = Math.max(0, Number(input.totalOdometerKm) || 0);
  const tripKm = Math.max(0, Number(input.tripRideshareKm) || 0);
  const companyOpsKm = Math.max(0, Number(input.companyOpsKm) || 0);
  const availableKm = totalOdo > 0 ? Math.max(0, totalOdo - tripKm - companyOpsKm) : 0;
  const hint = Math.max(0, Number(input.deadheadHintKm) || 0);
  const deadheadKm = round2(Math.min(availableKm, hint));
  const unattributedKm = round2(Math.max(0, availableKm - deadheadKm));
  return {
    rideShareKm: tripKm,
    personalKm: 0,
    companyOpsKm,
    deadheadKm,
    unattributedKm,
    totalOdometerKm: totalOdo,
    availableKm,
    industryBenchmarkPct:
      Number(input.industryFallbackPct) ||
      Number(input.policy?.industryFallbackPct) ||
      INDUSTRY_DEADHEAD_BENCHMARK_PCT,
    confidence: {
      rideShare: tripKm > 0 ? 'high' : 'low',
      personal: 'high',
      deadhead: deadheadKm > 0 ? 'medium' : 'low',
    },
    method: 'fuel_brain_v2',
  };
}
