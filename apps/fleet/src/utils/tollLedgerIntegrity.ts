/**
 * Toll ledger integrity — content fingerprint, plaza SSOT, quarantine.
 * Shared by Vite (fleet) and Deno (toll_controller / periods) via relative import.
 */

export type TollIntegrityLike = {
  id?: string | null;
  vehicleId?: string | null;
  date?: string | null;
  amount?: number | null;
  paymentMethod?: string | null;
  /** Ledger / API plaza name (may be missing on tx shape — use vendor). */
  plaza?: string | null;
  /** API tx shape: tollLedgerToTxShape puts ledger plaza here. */
  vendor?: string | null;
  batchId?: string | null;
  tripId?: string | null;
  quarantined?: boolean | null;
  metadata?: Record<string, unknown> | null;
  auditTrail?: Array<{ metadata?: Record<string, unknown> | null }> | null;
};

/** Normalize amount for fingerprint (usage debits compare as abs). */
export function tollFingerprintAmount(amount: number | null | undefined): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '0.00';
  return Math.abs(n).toFixed(2);
}

export function tollFingerprintDay(date: string | null | undefined): string {
  if (!date) return '';
  return String(date).trim().slice(0, 10);
}

/**
 * Content key to stop duplicate physical crossings with different UUIDs.
 * Prefer lane+collector; fall back to plaza when OCR lane/collector missing.
 */
export function buildTollContentFingerprint(input: {
  vehicleId?: string | null;
  date?: string | null;
  amount?: number | null;
  lane?: string | null;
  collector?: string | null;
  plaza?: string | null;
  metadata?: Record<string, unknown> | null;
}): string {
  const day = tollFingerprintDay(input.date);
  const amt = tollFingerprintAmount(input.amount);
  const vehicle = String(input.vehicleId || '').trim().toLowerCase() || 'novid';
  const meta = input.metadata || {};
  const lane = String(input.lane ?? meta.lane ?? '').trim().toLowerCase();
  const collector = String(input.collector ?? meta.collector ?? '').trim().toLowerCase();
  const plaza = String(
    input.plaza ?? meta.plaza ?? meta.tollPlaza ?? '',
  )
    .trim()
    .toLowerCase();
  const detail =
    lane || collector
      ? `lane:${lane}|collector:${collector}`
      : `plaza:${plaza}`;
  return `${vehicle}|${day}|${amt}|${detail}`;
}

export function fingerprintFromTollLike(t: TollIntegrityLike): string {
  return buildTollContentFingerprint({
    vehicleId: t.vehicleId,
    date: t.date,
    amount: t.amount,
    metadata: t.metadata || undefined,
    plaza: t.plaza ?? t.vendor,
  });
}

/**
 * Display plaza SSOT: prefer OCR plaza / tollPlaza over highway merchant name.
 * Keeps merchant/highway in metadata for audit, not as the plaza column.
 */
export function resolveTollPlazaSSot(input: {
  vendor?: string | null;
  plaza?: string | null;
  metadata?: Record<string, unknown> | null;
}): { plaza: string | null; highway: string | null; metadata: Record<string, unknown> } {
  const meta: Record<string, unknown> = { ...(input.metadata || {}) };
  const ocrPlaza = String(meta.plaza || meta.tollPlaza || '').trim();
  const vendor = String(input.vendor || input.plaza || '').trim();
  const plaza = ocrPlaza || vendor || null;
  if (vendor && ocrPlaza && vendor.toLowerCase() !== ocrPlaza.toLowerCase()) {
    if (!meta.highway && !meta.merchantHighway) {
      meta.highway = vendor;
      meta.merchantHighway = vendor;
    }
  }
  const highway =
    (typeof meta.highway === 'string' && meta.highway.trim()) ||
    (typeof meta.merchantHighway === 'string' && meta.merchantHighway.trim()) ||
    null;
  return { plaza, highway, metadata: meta };
}

const TRANSJAM_RE =
  /trans\s*jam|transjamaican|transjamaica|transjama\b|jamaican\s*highways/i;

export function looksLikeTransjamHighwayName(plaza: string | null | undefined): boolean {
  if (!plaza) return false;
  return TRANSJAM_RE.test(String(plaza));
}

export function hasFabricatedManualTripId(tripId: string | null | undefined): boolean {
  if (!tripId) return false;
  return /^manual_/i.test(String(tripId).trim());
}

export function hasMigrationAuditSource(t: TollIntegrityLike): boolean {
  const trail =
    t.auditTrail ||
    (Array.isArray(t.metadata?.auditTrail)
      ? (t.metadata!.auditTrail as Array<{ metadata?: Record<string, unknown> | null }>)
      : []);
  for (const e of trail) {
    const src = e?.metadata?.source;
    if (src === 'migration' || src === 'backfill') return true;
  }
  return false;
}

/** Batch id on ledger row or API tx metadata (tollLedgerToTxShape). */
export function resolveTollBatchId(t: TollIntegrityLike): string | null {
  if (t.batchId) return String(t.batchId);
  const metaBatch = t.metadata?.batchId;
  if (metaBatch != null && String(metaBatch).trim()) return String(metaBatch);
  return null;
}

/**
 * Names that may carry the fake highway (API shape hides ledger plaza in vendor /
 * ledgerPlaza after OCR metadata.plaza overwrites metadata.plaza).
 */
function highwayNameCandidates(t: TollIntegrityLike): string[] {
  const meta = t.metadata || {};
  return [
    t.plaza,
    t.vendor,
    meta.ledgerPlaza,
    meta.highway,
    meta.merchantHighway,
    meta.plaza,
    meta.tollPlaza,
  ]
    .map((v) => (v == null ? '' : String(v).trim()))
    .filter(Boolean);
}

function ocrPlazaName(t: TollIntegrityLike): string {
  const meta = t.metadata || {};
  const ocr = String(meta.plaza || meta.tollPlaza || '').trim();
  if (ocr && !looksLikeTransjamHighwayName(ocr)) return ocr;
  return '';
}

/**
 * Audit 1.1 signature: cash, no batch, highway-as-plaza (Transjam spelling soup)
 * and/or fabricated manual_* trip ids — exclude from spend until deleted.
 * Must work on both ledger rows and tollLedgerToTxShape API rows.
 */
export function matchesSyntheticCashTollSignature(t: TollIntegrityLike): boolean {
  const pm = String(t.paymentMethod || '').toLowerCase();
  if (!pm.includes('cash')) return false;
  if (resolveTollBatchId(t)) return false;
  if (t.metadata?.quarantined === false) return false;
  if (t.metadata?.source === 'refund_resolution') return false;

  const candidates = highwayNameCandidates(t);
  const highwayLike = candidates.some((n) => looksLikeTransjamHighwayName(n));
  const displayHighway = String(t.vendor || t.plaza || t.metadata?.ledgerPlaza || '').trim();
  const ocr = ocrPlazaName(t);
  const plazaMismatch =
    Boolean(displayHighway) &&
    Boolean(ocr) &&
    displayHighway.toLowerCase() !== ocr.toLowerCase() &&
    looksLikeTransjamHighwayName(displayHighway);

  return (
    highwayLike ||
    plazaMismatch ||
    hasFabricatedManualTripId(t.tripId) ||
    (hasMigrationAuditSource(t) && highwayLike)
  );
}

export function isTollQuarantined(t: TollIntegrityLike): boolean {
  if (t.quarantined === true) return true;
  if (t.metadata?.quarantined === true) return true;
  if (t.metadata?.tollQuarantined === true) return true;
  if (t.metadata?.excludeFromSpend === true) return true;
  return matchesSyntheticCashTollSignature(t);
}

export function quarantineReasonFor(t: TollIntegrityLike): string {
  if (typeof t.metadata?.quarantineReason === 'string' && t.metadata.quarantineReason) {
    return t.metadata.quarantineReason;
  }
  if (hasFabricatedManualTripId(t.tripId)) return 'fabricated_manual_trip_id';
  if (highwayNameCandidates(t).some((n) => looksLikeTransjamHighwayName(n))) {
    return 'transjam_highway_as_plaza';
  }
  const displayHighway = String(t.vendor || t.plaza || '').trim();
  const ocr = ocrPlazaName(t);
  if (displayHighway && ocr && displayHighway.toLowerCase() !== ocr.toLowerCase()) {
    return 'plaza_vs_metadata_plaza_mismatch';
  }
  return 'synthetic_cash_no_batch';
}

/** Spend / period counts must ignore quarantined rows. */
export function isTollIncludedInSpend(t: TollIntegrityLike): boolean {
  return !isTollQuarantined(t);
}

/**
 * Vineyards East rate check (audit 3.4): tag statement ~$780 vs OCR cash ~$850.
 */
export const VINEYARDS_EAST_TAG_RATE_JMD = 780;
export const VINEYARDS_EAST_CASH_OCR_RATE_JMD = 850;

export function isSuspiciousVineyardsCashRate(t: TollIntegrityLike): boolean {
  const pm = String(t.paymentMethod || '').toLowerCase();
  if (!pm.includes('cash')) return false;
  const plaza = `${t.plaza || ''} ${t.vendor || ''} ${t.metadata?.plaza || ''}`.toLowerCase();
  if (!plaza.includes('vineyard')) return false;
  const abs = Math.abs(Number(t.amount) || 0);
  return Math.abs(abs - VINEYARDS_EAST_CASH_OCR_RATE_JMD) < 0.01;
}
