/**
 * Fuel Brain classifier v2 — residual Personal (keep in sync with
 * apps/fleet/src/utils/fuelBrainClassify.ts).
 *
 * Deadhead = min(Available, max(hint, Available × industryFallbackPct%))
 */

const DEFAULT_INDUSTRY_FALLBACK_PCT = 35;

export interface ClassifyWeekInput {
  totalOdometerKm: number;
  tripRideshareKm: number;
  companyOpsKm: number;
  deadheadHintKm?: number;
  /** Industry floor % of Available (default 35). */
  industryFallbackPct?: number;
}

export interface ClassifyWeekResult {
  rideShareKm: number;
  personalKm: number;
  companyOpsKm: number;
  deadheadKm: number;
  totalOdometerKm: number;
  availableKm: number;
  confidence: {
    rideShare: "high" | "medium" | "low";
    personal: "high" | "medium" | "low";
    deadhead: "high" | "medium" | "low";
  };
  method: "fuel_brain_v2";
}

function applyDeadheadFloor(
  hintKm: number,
  availableKm: number,
  industryFallbackPct: number = DEFAULT_INDUSTRY_FALLBACK_PCT,
): number {
  const available = Math.max(0, Number(availableKm) || 0);
  const hint = Math.max(0, Number(hintKm) || 0);
  const pct = Math.max(
    0,
    Math.min(80, Number(industryFallbackPct) || DEFAULT_INDUSTRY_FALLBACK_PCT),
  );
  if (!(available > 0)) return 0;
  const floor = available * (pct / 100);
  return Number(Math.min(available, Math.max(hint, floor)).toFixed(2));
}

export function classifyFuelWeek(input: ClassifyWeekInput): ClassifyWeekResult {
  const totalOdo = Math.max(0, Number(input.totalOdometerKm) || 0);
  const tripKm = Math.max(0, Number(input.tripRideshareKm) || 0);
  const companyOpsKm = Math.max(0, Number(input.companyOpsKm) || 0);

  const availableKm =
    totalOdo > 0 ? Math.max(0, totalOdo - tripKm - companyOpsKm) : 0;

  const industryPct =
    Number(input.industryFallbackPct) || DEFAULT_INDUSTRY_FALLBACK_PCT;
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
      rideShare: tripKm > 0 ? "high" : "low",
      personal: personalKm > 0 ? "medium" : "high",
      deadhead: deadheadKm > 0 ? "medium" : "low",
    },
    method: "fuel_brain_v2",
  };
}
