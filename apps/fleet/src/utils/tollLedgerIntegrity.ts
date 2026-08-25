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
  plaza?: string | null;
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
    plaza: t.plaza,
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
  const trail = t.auditTrail || [];
  for (const e of trail) {
    const src = e?.metadata?.source;
    if (src === 'migration' || src === 'backfill') return true;
  }
  return false;
}

/**
 * Audit 1.1 signature: cash, no batch, highway-as-plaza (Transjam spelling soup)
 * and/or fabricated manual_* trip ids — exclude from spend until deleted.
 */
export function matchesSyntheticCashTollSignature(t: TollIntegrityLike): boolean {
  const pm = String(t.paymentMethod || '').toLowerCase();
  if (!pm.includes('cash')) return false;
  if (t.batchId) return false;
  if (t.metadata?.quarantined === false) return false;
  if (t.metadata?.source === 'refund_resolution') return false;

  const plaza = String(t.plaza || '');
  const metaPlaza = String(t.metadata?.plaza || t.metadata?.tollPlaza || '');
  const highwayLike = looksLikeTransjamHighwayName(plaza) || looksLikeTransjamHighwayName(metaPlaza);
  const plazaMismatch =
    Boolean(plaza) &&
    Boolean(metaPlaza) &&
    plaza.toLowerCase() !== metaPlaza.toLowerCase() &&
    looksLikeTransjamHighwayName(plaza);

  return (
    highwayLike ||
    plazaMismatch ||
    hasFabricatedManualTripId(t.tripId) ||
    (hasMigrationAuditSource(t) && !t.batchId && highwayLike)
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
  if (looksLikeTransjamHighwayName(t.plaza)) return 'transjam_highway_as_plaza';
  const metaPlaza = String(t.metadata?.plaza || '');
  if (
    t.plaza &&
    metaPlaza &&
    String(t.plaza).toLowerCase() !== metaPlaza.toLowerCase()
  ) {
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
 * Documented for ops; cash rows at 850 with Vineyards plaza are suspicious when
 * paired with Transjam/migration signature but not auto-quarantined alone.
 */
export const VINEYARDS_EAST_TAG_RATE_JMD = 780;
export const VINEYARDS_EAST_CASH_OCR_RATE_JMD = 850;

export function isSuspiciousVineyardsCashRate(t: TollIntegrityLike): boolean {
  const pm = String(t.paymentMethod || '').toLowerCase();
  if (!pm.includes('cash')) return false;
  const plaza = `${t.plaza || ''} ${t.metadata?.plaza || ''}`.toLowerCase();
  if (!plaza.includes('vineyard')) return false;
  const abs = Math.abs(Number(t.amount) || 0);
  return Math.abs(abs - VINEYARDS_EAST_CASH_OCR_RATE_JMD) < 0.01;
}
