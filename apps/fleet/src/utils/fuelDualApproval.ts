/** Default JMD threshold — weeks above this need a distinct second approver before lock. */
export const FUEL_SECOND_APPROVER_THRESHOLD = 50_000;

/** Org prefs may override via `fuelSecondApproverThreshold` (0 = dual-approval off). */
export function resolveFuelSecondApproverThreshold(orgOverride?: number | null): number {
  const n = Number(orgOverride);
  if (Number.isFinite(n) && n >= 0) return n;
  return FUEL_SECOND_APPROVER_THRESHOLD;
}

export function needsSecondApprover(
  totalSpend: number,
  threshold: number = FUEL_SECOND_APPROVER_THRESHOLD,
): boolean {
  if (threshold <= 0) return false;
  return (Number(totalSpend) || 0) > threshold;
}

/** True when audit has second_approve from someone other than the finalizer. */
export function hasDistinctSecondApprove(
  approvalActorIds: string[],
  finalizerUserId: string | null | undefined,
): boolean {
  const me = String(finalizerUserId || '');
  return approvalActorIds.some((id) => {
    const a = String(id || '');
    return Boolean(a) && (!me || a !== me);
  });
}
