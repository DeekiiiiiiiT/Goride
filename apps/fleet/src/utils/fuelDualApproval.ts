/** Default JMD threshold — weeks above this need a distinct second approver before lock. */
export const FUEL_SECOND_APPROVER_THRESHOLD = 50_000;

export type FuelAutoCloseDualApprovalMode = 'skip' | 'service_approve';
export type FuelDualApprovalUiMode = 'human' | 'service_only';

/** Org prefs may override via `fuelSecondApproverThreshold` (0 = dual-approval off). */
export function resolveFuelSecondApproverThreshold(orgOverride?: number | null): number {
  const n = Number(orgOverride);
  if (Number.isFinite(n) && n >= 0) return n;
  return FUEL_SECOND_APPROVER_THRESHOLD;
}

export function resolveFuelAutoCloseDualApprovalMode(
  raw?: string | null,
): FuelAutoCloseDualApprovalMode {
  return String(raw || '').toLowerCase() === 'service_approve' ? 'service_approve' : 'skip';
}

export function resolveFuelDualApprovalUiMode(raw?: string | null): FuelDualApprovalUiMode {
  return String(raw || '').toLowerCase() === 'service_only' ? 'service_only' : 'human';
}

export function needsSecondApprover(
  totalSpend: number,
  threshold: number = FUEL_SECOND_APPROVER_THRESHOLD,
): boolean {
  if (threshold <= 0) return false;
  return (Number(totalSpend) || 0) > threshold;
}

/**
 * Client gate: whether the wizard must wait for a *human* second approver.
 * service_only mode relies on server writing system second_approve on finalize.
 */
export function needsHumanSecondApprover(
  totalSpend: number,
  threshold: number,
  uiMode: FuelDualApprovalUiMode = 'human',
): boolean {
  if (uiMode === 'service_only') return false;
  return needsSecondApprover(totalSpend, threshold);
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
