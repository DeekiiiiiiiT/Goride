/**
 * Platform fee + fare gross recognition — shared by Business Finance P&L and InDrive Wallet.
 *
 * Rules (per platform):
 * 1. Explicit fees = Σ |netAmount| on platform_fee
 * 2. Implied fees = Σ max(0, grossAmount − netAmount) on fare_earning
 * 3. Recognized fees = explicit if > 0, else implied
 * 4. Fare gross for P&L = grossAmount when it exceeds net (pre-commission); else net
 */

export type PlatformFeeLedgerLike = Record<string, unknown>;

export function normalizePlatformLabel(platform: unknown): string {
  const raw = platform === 'GoRide' ? 'Roam' : platform;
  const p = String(raw || 'unknown').toLowerCase();
  if (p.includes('uber')) return 'Uber';
  if (p.includes('indrive') || p.includes('in_drive')) return 'InDrive';
  if (p.includes('roam')) return 'Roam';
  if (p === 'unknown' || !p) return 'Other';
  // Preserve known display names when already normalized
  if (raw === 'Uber' || raw === 'InDrive' || raw === 'Roam' || raw === 'Other') return String(raw);
  return String(raw || 'Other');
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Pre-commission fare contribution from a fare_earning row. */
export function recognizedFareGross(e: PlatformFeeLedgerLike): number {
  const net = num(e.netAmount);
  const gross = num(e.grossAmount);
  if (gross > net + 1e-9) return Math.abs(gross);
  return Math.abs(net) || Math.abs(gross);
}

/** Implied commission on a fare_earning row (never negative). */
export function impliedFareFeeGap(e: PlatformFeeLedgerLike): number {
  const net = num(e.netAmount);
  const gross = num(e.grossAmount);
  return Math.max(0, gross - net);
}

export type PlatformFeeBucket = {
  explicitFees: number;
  impliedFees: number;
  /** fare_earning pre-commission gross */
  fareGross: number;
  tipPromo: number;
};

export type RecognizedPlatformFees = {
  /** Total recognized fees across platforms */
  totalFees: number;
  /** Gross trip revenue (fare pre-commission + tips + promotions) */
  totalGross: number;
  byPlatform: Map<string, { gross: number; fees: number }>;
};

function emptyBucket(): PlatformFeeBucket {
  return { explicitFees: 0, impliedFees: 0, fareGross: 0, tipPromo: 0 };
}

/**
 * Accumulate fee/gross buckets from ledger rows (caller scopes period if needed).
 * Optional `platformFilter` limits to one platform (e.g. InDrive for wallet).
 */
export function accumulatePlatformFeeBuckets(
  entries: ReadonlyArray<PlatformFeeLedgerLike>,
  platformFilter?: string,
): Map<string, PlatformFeeBucket> {
  const by = new Map<string, PlatformFeeBucket>();
  const want = platformFilter ? normalizePlatformLabel(platformFilter) : null;

  for (const e of entries) {
    const plat = normalizePlatformLabel(e.platform);
    if (want && plat !== want) continue;
    if (!by.has(plat)) by.set(plat, emptyBucket());
    const b = by.get(plat)!;
    const et = String(e.eventType || '');

    if (et === 'platform_fee') {
      b.explicitFees += Math.abs(num(e.netAmount));
    } else if (et === 'fare_earning') {
      b.fareGross += recognizedFareGross(e);
      b.impliedFees += impliedFareFeeGap(e);
    } else if (et === 'tip' || et === 'promotion') {
      const amt = Math.abs(num(e.netAmount)) || Math.abs(num(e.grossAmount));
      b.tipPromo += amt;
    }
  }
  return by;
}

export function recognizedFeesFromBucket(b: PlatformFeeBucket): number {
  return b.explicitFees > 0 ? b.explicitFees : b.impliedFees;
}

export function recognizedGrossFromBucket(b: PlatformFeeBucket): number {
  return b.fareGross + b.tipPromo;
}

/** Full P&L-style recognition over a scoped event list. */
export function recognizePlatformGrossAndFees(
  entries: ReadonlyArray<PlatformFeeLedgerLike>,
  platformFilter?: string,
): RecognizedPlatformFees {
  const buckets = accumulatePlatformFeeBuckets(entries, platformFilter);
  let totalFees = 0;
  let totalGross = 0;
  const byPlatform = new Map<string, { gross: number; fees: number }>();

  for (const [plat, b] of buckets) {
    const fees = recognizedFeesFromBucket(b);
    const gross = recognizedGrossFromBucket(b);
    if (fees < 0.005 && gross < 0.005) continue;
    totalFees += fees;
    totalGross += gross;
    byPlatform.set(plat, { gross: round2(gross), fees: round2(fees) });
  }

  return {
    totalFees: round2(totalFees),
    totalGross: round2(totalGross),
    byPlatform,
  };
}

/**
 * Period + lifetime fees for one platform (Wallet Center / per-driver).
 * Lifetime = all rows; period = date in [startDate, endDate].
 */
export function computePlatformFeesPeriodAndLifetime(
  entries: ReadonlyArray<PlatformFeeLedgerLike>,
  platform: string,
  startDate: string,
  endDate: string,
): { periodFees: number; lifetimeFees: number } {
  const plat = normalizePlatformLabel(platform);
  const rowDate = (raw: unknown) =>
    raw != null && typeof raw === 'string' ? String(raw).split('T')[0] : '';

  const periodRows: PlatformFeeLedgerLike[] = [];
  const lifetimeRows: PlatformFeeLedgerLike[] = [];

  for (const e of entries) {
    if (normalizePlatformLabel(e.platform) !== plat) continue;
    const et = String(e.eventType || '');
    if (et !== 'platform_fee' && et !== 'fare_earning') continue;
    lifetimeRows.push(e);
    const d = rowDate(e.date);
    if (d >= startDate && d <= endDate) periodRows.push(e);
  }

  const period = recognizePlatformGrossAndFees(periodRows, plat);
  const lifetime = recognizePlatformGrossAndFees(lifetimeRows, plat);
  return {
    periodFees: period.totalFees,
    lifetimeFees: lifetime.totalFees,
  };
}
