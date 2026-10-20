/**
 * Staged toll import row classification (P2).
 * provider_ref match → duplicate_ref; fingerprint without ref match → duplicate_fingerprint.
 */
import {
  buildTollContentFingerprint,
  isTollLedgerVoided,
  normalizeTollReferenceNumber,
  resolveTollReferenceNumber,
  type TollIntegrityLike,
} from './tollLedgerIntegrity.ts';

export type StagedTollRowClassification =
  | 'new'
  | 'duplicate_ref'
  | 'duplicate_fingerprint'
  | 'rejected'
  | 'spill';

export type ClassifyTollImportRowResult = {
  classification: StagedTollRowClassification;
  existingId?: string;
  reason?: string;
};

/** Import warning fingerprint — ignores Txn ID so round-trip same plaza/day/amount surfaces as byFingerprint. */
export function tollImportCrossingFingerprint(t: TollIntegrityLike): string {
  const meta = t.metadata || {};
  return buildTollContentFingerprint({
    vehicleId: t.vehicleId,
    date: t.date,
    amount: t.amount,
    plaza: t.plaza ?? t.vendor,
    lane: typeof meta.lane === 'string' ? meta.lane : null,
    collector: typeof meta.collector === 'string' ? meta.collector : null,
    metadata: meta,
    referenceNumber: null,
  });
}

function refDedupKeysMatch(a: TollIntegrityLike, b: TollIntegrityLike): boolean {
  const refA = resolveTollReferenceNumber(a);
  const refB = resolveTollReferenceNumber(b);
  if (!refA || refB !== refA) return false;
  const dayA = String(a.date || '').slice(0, 10);
  const dayB = String(b.date || '').slice(0, 10);
  if (dayA !== dayB) return false;
  const amtA = Math.abs(Number(a.amount) || 0).toFixed(2);
  const amtB = Math.abs(Number(b.amount) || 0).toFixed(2);
  if (amtA !== amtB) return false;
  const vehicleA = String(a.vehicleId || '').trim();
  const vehicleB = String(b.vehicleId || '').trim();
  if (vehicleA && vehicleB && vehicleA !== vehicleB) return false;
  return true;
}

/** Ref-only duplicate check (for override commit path). */
export function findDuplicateTollByReferenceOnly(
  candidate: TollIntegrityLike,
  existing: readonly TollIntegrityLike[],
): { existingId: string } | null {
  const candidateRef = resolveTollReferenceNumber(candidate);
  if (!candidateRef) return null;
  const candidateId = candidate.id != null ? String(candidate.id) : '';
  for (const row of existing) {
    if (!row) continue;
    const rowId = row.id != null ? String(row.id) : '';
    if (candidateId && rowId === candidateId) continue;
    const rowRef = resolveTollReferenceNumber(row);
    if (rowRef && rowRef === candidateRef) {
      return { existingId: rowId };
    }
  }
  return null;
}

/**
 * Classify one import row against existing ledger (+ optional intra-batch refs).
 * Different Txn ID + same fingerprint → duplicate_fingerprint, not duplicate_ref.
 */
export function classifyTollImportRow(
  candidate: TollIntegrityLike,
  existing: readonly TollIntegrityLike[],
  opts?: { intraBatchRefs?: ReadonlySet<string> },
): ClassifyTollImportRowResult {
  const ref = resolveTollReferenceNumber(candidate);
  if (ref && opts?.intraBatchRefs?.has(ref)) {
    return { classification: 'duplicate_ref', reason: 'duplicate_ref_in_batch' };
  }

  const candidateId = candidate.id != null ? String(candidate.id) : '';
  for (const row of existing) {
    if (!row || isTollLedgerVoided(row)) continue;
    const rowId = row.id != null ? String(row.id) : '';
    if (candidateId && rowId === candidateId) continue;
    if (refDedupKeysMatch(candidate, row)) {
      return {
        classification: 'duplicate_ref',
        existingId: rowId,
        reason: 'provider_ref_match',
      };
    }
  }

  const candCross = tollImportCrossingFingerprint(candidate);
  for (const row of existing) {
    if (!row || isTollLedgerVoided(row)) continue;
    const rowId = row.id != null ? String(row.id) : '';
    if (candidateId && rowId === candidateId) continue;
    if (tollImportCrossingFingerprint(row) !== candCross) continue;
    const existingRef = resolveTollReferenceNumber(row);
    return {
      classification: 'duplicate_fingerprint',
      existingId: rowId,
      reason:
        ref && existingRef && ref !== existingRef
          ? 'fingerprint_match_different_ref'
          : 'fingerprint_match',
    };
  }

  return { classification: 'new' };
}

/** Staging row ids for fingerprint dup overrides use `${importId}:${rowIndex}`. */
export function parseStagingRowOverrideId(id: string): { importId: string; rowIndex: number } | null {
  const m = /^([0-9a-f-]{36}):(\d+)$/i.exec(String(id || '').trim());
  if (!m) return null;
  return { importId: m[1], rowIndex: Number(m[2]) };
}

export function stagingRowOverrideId(importId: string, rowIndex: number): string {
  return `${importId}:${rowIndex}`;
}

export function normalizeProviderRefForIndex(ref: string | null | undefined): string | null {
  const n = normalizeTollReferenceNumber(ref);
  return n || null;
}
