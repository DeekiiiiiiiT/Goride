/**
 * Finalize gate when Fuel Brain consumer is on: block/warn if Unknown exceeds policy.
 */

export type UnknownFinalizePolicy = {
  unknownFinalizeThresholdKm: number;
  unknownFinalizeThresholdPct: number;
};

export const DEFAULT_UNKNOWN_FINALIZE_POLICY: UnknownFinalizePolicy = {
  unknownFinalizeThresholdKm: 25,
  unknownFinalizeThresholdPct: 10,
};

export type UnknownGateResult = {
  blocked: boolean;
  warnOnly: boolean;
  reasons: string[];
};

export function evaluateUnknownFinalizeGate(
  reports: Array<{
    unknownDistance?: number;
    personalDistance?: number;
    deadheadDistance?: number;
    totalTripDistance?: number;
    companyMiscDistance?: number;
    metadata?: { fuelBrain?: { unknownPct?: number } };
  }>,
  policy: UnknownFinalizePolicy = DEFAULT_UNKNOWN_FINALIZE_POLICY,
  opts?: { acknowledge?: boolean },
): UnknownGateResult {
  const reasons: string[] = [];
  let overThreshold = false;

  for (const r of reports) {
    const unknownKm = Number(r.unknownDistance) || 0;
    if (unknownKm <= 0) continue;

    const accounted =
      (Number(r.totalTripDistance) || 0) +
      (Number(r.companyMiscDistance) || 0) +
      (Number(r.personalDistance) || 0) +
      (Number(r.deadheadDistance) || 0) +
      unknownKm;
    const pct =
      r.metadata?.fuelBrain?.unknownPct ??
      (accounted > 0 ? (unknownKm / accounted) * 100 : 0);

    if (unknownKm >= policy.unknownFinalizeThresholdKm) {
      overThreshold = true;
      reasons.push(
        `Unknown ${unknownKm.toFixed(1)} km exceeds ${policy.unknownFinalizeThresholdKm} km threshold`,
      );
    } else if (pct >= policy.unknownFinalizeThresholdPct) {
      overThreshold = true;
      reasons.push(
        `Unknown ${pct.toFixed(1)}% exceeds ${policy.unknownFinalizeThresholdPct}% threshold`,
      );
    }
  }

  if (!overThreshold) {
    return { blocked: false, warnOnly: false, reasons: [] };
  }

  if (opts?.acknowledge) {
    return { blocked: false, warnOnly: true, reasons };
  }

  return { blocked: true, warnOnly: false, reasons };
}
