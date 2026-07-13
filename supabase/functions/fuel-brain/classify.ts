/**
 * Fuel Brain classifier v2 — residual Personal (keep in sync with
 * apps/fleet/src/utils/fuelBrainClassify.ts).
 */

export interface ClassifyWeekInput {
  totalOdometerKm: number;
  tripRideshareKm: number;
  companyOpsKm: number;
  deadheadHintKm?: number;
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

export function classifyFuelWeek(input: ClassifyWeekInput): ClassifyWeekResult {
  const totalOdo = Math.max(0, Number(input.totalOdometerKm) || 0);
  const tripKm = Math.max(0, Number(input.tripRideshareKm) || 0);
  const companyOpsKm = Math.max(0, Number(input.companyOpsKm) || 0);

  const availableKm =
    totalOdo > 0 ? Math.max(0, totalOdo - tripKm - companyOpsKm) : 0;

  const deadheadHint = Math.max(0, Number(input.deadheadHintKm) || 0);
  const deadheadKm = Math.min(deadheadHint, availableKm);
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
