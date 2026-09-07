/**
 * Close hash (audit H-4).
 *
 * The legacy `sourceEventHash` (driver_financial_periods.ts:1094-1108) hashed
 * eleven fields and OMITTED tollReimbursed, fuelFleetShare, earningsGross,
 * tipsPaidToDriver, tollCashSpend, disputeRefundMatched, cashStillHeld and
 * settlementAmount — so a change in reimbursement, fleet share, tips or the
 * settled amount itself produced an IDENTICAL hash. It was written and read
 * back but never compared to anything: an integrity control that guaranteed
 * nothing.
 *
 * This is the real thing: it hashes the COMPLETE computed row plus the INPUT
 * source-row ids and versions, stored on close and verifiable on every read of
 * a closed week. Runtime-agnostic (Deno / browser / Node 20+) via WebCrypto.
 */

/** Deterministic JSON: object keys sorted recursively so hash is stable. */
export function canonicalStringify(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === 'object') {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(src).sort()) {
      const v = src[key];
      if (v === undefined) continue; // undefined must not shift the hash
      out[key] = sortDeep(v);
    }
    return out;
  }
  return value;
}

/** SHA-256 hex of the canonical serialization of `payload`. */
export async function buildCloseHash(payload: unknown): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('buildCloseHash: WebCrypto subtle unavailable in this runtime');
  }
  const bytes = new TextEncoder().encode(canonicalStringify(payload));
  const digest = await subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Complete field set for a period close hash (H-4). Every money field the
 * legacy hash omitted is required here; `undefined` is dropped by
 * canonicalStringify so callers may pass a partial row without silently
 * changing the hash relative to an explicit 0.
 */
export type PeriodCloseHashRow = {
  // toll lane
  tollSpend?: number;
  tollCashSpend?: number;
  tollTagSpend?: number;
  tollReimbursed?: number;
  tollChargedToDriver?: number;
  tollUnmatchedCount?: number;
  disputeRefundMatched?: number;
  disputeRefundUnmatched?: number;
  // fuel lane
  fuelDeduction?: number;
  fuelFleetShare?: number;
  fuelFinalized?: boolean;
  // earnings / cash lane
  driverShare?: number;
  fleetShare?: number;
  earningsGross?: number;
  tipsPaidToDriver?: number;
  cashCollected?: number;
  cashReturned?: number;
  cashWrittenOff?: number;
  cashStillHeld?: number;
  settlementPaid?: number;
  settlementAmount?: number;
  payoutNet?: number;
  lineCount?: number;
};

/**
 * Assemble the canonical close-hash payload: the complete computed row plus the
 * input source-row ids and their versions. `engineVersion` binds the hash to
 * the code that produced it so a formula change invalidates a stored hash.
 */
export function buildPeriodCloseHashPayload(input: {
  row: PeriodCloseHashRow;
  sourceRowIds: string[];
  sourceVersions?: Record<string, number>;
  engineVersion: string;
}): {
  engineVersion: string;
  row: PeriodCloseHashRow;
  sourceRowIds: string[];
  sourceVersions: Record<string, number>;
} {
  return {
    engineVersion: input.engineVersion,
    row: input.row,
    // ids sorted so ordering upstream cannot change the hash
    sourceRowIds: [...input.sourceRowIds].map(String).sort(),
    sourceVersions: input.sourceVersions ?? {},
  };
}

export type PeriodCloseHashVerifyResult = {
  ok: boolean;
  /** True when the week is frozen but no stored hash exists (legacy close). */
  missingStored?: boolean;
  stored?: string;
  expected?: string;
};

/**
 * Recompute the close hash from a persisted period-shaped row and compare to
 * the stored source_event_hash / metadata.financeCore.closeHash (H-4).
 * Callers should only invoke this for frozen weeks.
 */
export async function verifyPeriodCloseHash(input: {
  row: PeriodCloseHashRow;
  storedHash?: string | null;
  sourceRowIds?: string[];
  sourceVersions?: Record<string, number>;
  engineVersion?: string;
}): Promise<PeriodCloseHashVerifyResult> {
  const stored = String(input.storedHash || '').trim();
  if (!stored) return { ok: false, missingStored: true };

  const payload = buildPeriodCloseHashPayload({
    row: input.row,
    sourceRowIds: input.sourceRowIds ?? [],
    sourceVersions: input.sourceVersions,
    engineVersion: input.engineVersion || 'week-statement@1',
  });
  const expected = await buildCloseHash(payload);
  return {
    ok: expected === stored,
    stored,
    expected,
  };
}

/** Pull stored close hash from a DFP-like row (column or metadata). */
export function storedCloseHashFromPeriod(period: {
  source_event_hash?: string | null;
  sourceEventHash?: string | null;
  metadata?: Record<string, unknown> | null;
} | null | undefined): string | null {
  if (!period) return null;
  const col = String(period.source_event_hash || period.sourceEventHash || '').trim();
  if (col) return col;
  const meta = period.metadata || {};
  const fc = (meta.financeCore as Record<string, unknown> | undefined) || {};
  const fromMeta = String(fc.closeHash || '').trim();
  return fromMeta || null;
}
