import type { Claim, FinancialTransaction } from '../types/data';
import { isTollInWizardPeriod } from './tollWeekPeriod';

/** Higher = preferred when multiple claims share a transactionId. */
const STATUS_PRIORITY: Record<Claim['status'], number> = {
  Sent_to_Driver: 50,
  Submitted_to_Uber: 40,
  Open: 30,
  Rejected: 20,
  Resolved: 10,
};

function claimSortKey(c: Claim): number {
  const statusScore = STATUS_PRIORITY[c.status] ?? 0;
  const updated = new Date(c.updatedAt || c.createdAt || 0).getTime();
  return statusScore * 1e15 + updated;
}

/** Pick the single authoritative claim for a toll when duplicates exist. */
export function pickCanonicalClaimForToll(
  claims: Claim[],
  transactionId: string,
): Claim | undefined {
  const matches = claims.filter((c) => c.transactionId === transactionId);
  if (matches.length === 0) return undefined;
  return matches.reduce((best, c) => (claimSortKey(c) > claimSortKey(best) ? c : best));
}

/** One canonical claim per toll — uses all-time claims, not period-filtered. */
export function buildClaimByTollId(allClaims: Claim[]): Map<string, Claim> {
  const byToll = new Map<string, Claim[]>();
  for (const c of allClaims) {
    if (!c.transactionId) continue;
    const list = byToll.get(c.transactionId) ?? [];
    list.push(c);
    byToll.set(c.transactionId, list);
  }
  const map = new Map<string, Claim>();
  for (const [tollId, list] of byToll) {
    const canonical = list.reduce((best, c) => (claimSortKey(c) > claimSortKey(best) ? c : best));
    map.set(tollId, canonical);
  }
  return map;
}

export function getDuplicateClaimsForToll(allClaims: Claim[], transactionId: string): Claim[] {
  const canonical = pickCanonicalClaimForToll(allClaims, transactionId);
  if (!canonical) return [];
  return allClaims.filter(
    (c) => c.transactionId === transactionId && c.id !== canonical.id,
  );
}

/** All non-canonical claim ids for tolls that have duplicates. */
export function collectDuplicateClaimIds(allClaims: Claim[]): string[] {
  const byToll = new Map<string, Claim[]>();
  for (const c of allClaims) {
    if (!c.transactionId) continue;
    const list = byToll.get(c.transactionId) ?? [];
    list.push(c);
    byToll.set(c.transactionId, list);
  }
  const ids: string[] = [];
  for (const list of byToll.values()) {
    if (list.length <= 1) continue;
    const canonical = list.reduce((best, c) => (claimSortKey(c) > claimSortKey(best) ? c : best));
    for (const c of list) {
      if (c.id !== canonical.id) ids.push(c.id);
    }
  }
  return ids;
}

/** Pipeline lists: one row per toll; extras tracked for warnings. */
export function dedupeClaimsForDisplay(claims: Claim[]): {
  displayClaims: Claim[];
  duplicateCount: number;
} {
  const byToll = new Map<string, Claim[]>();
  const noToll: Claim[] = [];
  for (const c of claims) {
    if (!c.transactionId) {
      noToll.push(c);
      continue;
    }
    const list = byToll.get(c.transactionId) ?? [];
    list.push(c);
    byToll.set(c.transactionId, list);
  }
  const displayClaims: Claim[] = [...noToll];
  let duplicateCount = 0;
  for (const list of byToll.values()) {
    const canonical = list.reduce((best, c) => (claimSortKey(c) > claimSortKey(best) ? c : best));
    displayClaims.push(canonical);
    if (list.length > 1) duplicateCount += list.length - 1;
  }
  displayClaims.sort(
    (a, b) =>
      new Date(b.updatedAt || b.createdAt).getTime() -
      new Date(a.updatedAt || a.createdAt).getTime(),
  );
  return { displayClaims, duplicateCount };
}

/** Merge period-filtered reconciled tolls with same-week tolls the strict date API may drop. */
export function mergeReconciledTollsForUnderpaid(
  periodFiltered: FinancialTransaction[],
  allReconciled: FinancialTransaction[],
  periodWeekKey: string,
  fleetTz: string,
  claimTollIds: ReadonlySet<string>,
): FinancialTransaction[] {
  const byId = new Map(periodFiltered.map((t) => [t.id, t]));
  for (const tx of allReconciled) {
    if (!tx?.id || !tx.isReconciled || !tx.tripId || byId.has(tx.id)) continue;
    if (claimTollIds.has(tx.id) || isTollInWizardPeriod(tx, periodWeekKey, fleetTz)) {
      byId.set(tx.id, tx);
    }
  }
  return [...byId.values()];
}
