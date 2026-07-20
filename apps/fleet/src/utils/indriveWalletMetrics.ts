/**
 * InDrive wallet fee + load rules — shared by per-driver / fleet endpoints and Business Finance.
 * Period: [startDate, endDate] inclusive (YYYY-MM-DD). Lifetime: all rows (no date filter).
 * Loads: canonical `wallet_credit` only (not raw transaction:*).
 */

/** Match Wallet Center: estimatedBalance below this = "short". */
export const INDRIVE_WALLET_SHORT_THRESHOLD = -0.005;

export function isIndriveWalletShort(estimatedBalance: number): boolean {
  return estimatedBalance < INDRIVE_WALLET_SHORT_THRESHOLD;
}

function ledgerRowDate(raw: unknown): string {
  return raw != null && typeof raw === 'string' ? String(raw).split('T')[0] : '';
}

function walletCreditAmount(e: Record<string, unknown>): number {
  const net = Number(e.netAmount);
  if (Number.isFinite(net) && Math.abs(net) > 0) return Math.abs(net);
  const gross = Number(e.grossAmount);
  if (Number.isFinite(gross) && Math.abs(gross) > 0) return Math.abs(gross);
  return 0;
}

export function computeIndriveWalletFeesFromLedgerEntries(
  entries: ReadonlyArray<Record<string, unknown>>,
  startDate: string,
  endDate: string,
): { periodFees: number; lifetimeInDriveFees: number } {
  let platformFeeInDrive = 0;
  let fareGapInDrive = 0;
  let lifetimePlatformFeeInDrive = 0;
  let lifetimeFareGapInDrive = 0;

  for (const e of entries) {
    const plat = (e.platform === 'GoRide' ? 'Roam' : e.platform) || 'Other';
    const net = Number(e.netAmount) || 0;
    const gross = Number(e.grossAmount) || 0;
    const et = e.eventType;
    const d = ledgerRowDate(e.date);
    const inPeriod = d >= startDate && d <= endDate;

    if (et === 'platform_fee' && plat === 'InDrive') {
      const absNet = Math.abs(net);
      lifetimePlatformFeeInDrive += absNet;
      if (inPeriod) platformFeeInDrive += absNet;
    }
    if (et === 'fare_earning' && plat === 'InDrive') {
      const gap = gross - net;
      lifetimeFareGapInDrive += gap;
      if (inPeriod) fareGapInDrive += gap;
    }
  }

  const periodFees = platformFeeInDrive > 0 ? platformFeeInDrive : fareGapInDrive;
  const lifetimeInDriveFees =
    lifetimePlatformFeeInDrive > 0 ? lifetimePlatformFeeInDrive : lifetimeFareGapInDrive;

  return {
    periodFees: Number(periodFees.toFixed(2)),
    lifetimeInDriveFees: Number(lifetimeInDriveFees.toFixed(2)),
  };
}

/** Sum canonical wallet_credit amounts (period + lifetime). */
export function computeIndriveWalletLoadsFromLedgerEntries(
  entries: ReadonlyArray<Record<string, unknown>>,
  startDate: string,
  endDate: string,
): { periodLoads: number; lifetimeLoads: number } {
  let periodLoads = 0;
  let lifetimeLoads = 0;

  for (const e of entries) {
    if (e.eventType !== 'wallet_credit') continue;
    const amt = walletCreditAmount(e);
    if (amt <= 0) continue;
    const d = ledgerRowDate(e.date);
    lifetimeLoads += amt;
    if (d >= startDate && d <= endDate) periodLoads += amt;
  }

  return {
    periodLoads: Number(periodLoads.toFixed(2)),
    lifetimeLoads: Number(lifetimeLoads.toFixed(2)),
  };
}

export type IndriveWalletDriverSummaryRow = {
  driverId: string;
  periodLoads: number;
  periodFees: number;
  lifetimeLoads: number;
  lifetimeInDriveFees: number;
  estimatedBalance: number;
};

export type IndriveWalletFleetTotals = {
  periodLoads: number;
  periodFees: number;
  shortDriverCount: number;
};

type DriverIdRecord = {
  id: string;
  uberDriverId?: string | null;
  inDriveDriverId?: string | null;
};

/** Map Roam id + Uber/InDrive aliases → primary Roam driver id. */
export function buildIndriveWalletDriverAliasMap(
  drivers: ReadonlyArray<DriverIdRecord>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const d of drivers) {
    const primary = String(d.id || '').trim();
    if (!primary) continue;
    const add = (raw: string | null | undefined) => {
      const id = String(raw || '').trim();
      if (!id) return;
      map.set(id, primary);
      const lc = id.toLowerCase();
      if (lc !== id) map.set(lc, primary);
    };
    add(primary);
    add(d.uberDriverId);
    add(d.inDriveDriverId);
  }
  return map;
}

/**
 * One pass over canonical ledger → per-driver wallet summaries + fleet totals.
 * Loads from wallet_credit; fees via the same InDrive fee rule as the per-driver endpoint.
 */
export function buildIndriveWalletFleetFromLedger(
  drivers: ReadonlyArray<DriverIdRecord>,
  ledgerEntries: ReadonlyArray<Record<string, unknown>>,
  startDate: string,
  endDate: string,
): { drivers: IndriveWalletDriverSummaryRow[]; totals: IndriveWalletFleetTotals } {
  const aliasToPrimary = buildIndriveWalletDriverAliasMap(drivers);
  const byPrimary = new Map<string, Record<string, unknown>[]>();

  for (const d of drivers) {
    const id = String(d.id || '').trim();
    if (id) byPrimary.set(id, []);
  }

  for (const e of ledgerEntries) {
    const rawId = String(e.driverId || '').trim();
    if (!rawId) continue;
    const primary = aliasToPrimary.get(rawId) || aliasToPrimary.get(rawId.toLowerCase());
    if (!primary) continue;
    const bucket = byPrimary.get(primary);
    if (!bucket) continue;
    bucket.push(e);
  }

  const rows: IndriveWalletDriverSummaryRow[] = [];
  let totalPeriodLoads = 0;
  let totalPeriodFees = 0;
  let shortDriverCount = 0;

  for (const [driverId, entries] of byPrimary) {
    const { periodLoads, lifetimeLoads } = computeIndriveWalletLoadsFromLedgerEntries(
      entries,
      startDate,
      endDate,
    );
    const { periodFees, lifetimeInDriveFees } = computeIndriveWalletFeesFromLedgerEntries(
      entries,
      startDate,
      endDate,
    );
    const estimatedBalance = Number((lifetimeLoads - lifetimeInDriveFees).toFixed(2));
    if (isIndriveWalletShort(estimatedBalance)) shortDriverCount++;
    totalPeriodLoads += periodLoads;
    totalPeriodFees += periodFees;
    rows.push({
      driverId,
      periodLoads,
      periodFees,
      lifetimeLoads,
      lifetimeInDriveFees,
      estimatedBalance,
    });
  }

  return {
    drivers: rows,
    totals: {
      periodLoads: Number(totalPeriodLoads.toFixed(2)),
      periodFees: Number(totalPeriodFees.toFixed(2)),
      shortDriverCount,
    },
  };
}
