/**
 * Pure share + cash-base helpers for weekly driver_financial_periods rebuild.
 * Mirrors ledger earnings-history tier math and Settlement cash rules.
 */
import { getTripPhysicalCashCollected } from './tripPhysicalCash.ts';
import { isCashReturnedForWeek } from './driverCashPayment.ts';
import { normalizePlatform } from './normalizePlatform.ts';

export type LedgerFareLike = {
  date?: string;
  eventType?: string;
  grossAmount?: number;
  netAmount?: number;
};

/** Same tier pick as earnings_policy_runtime.getTierForEarningsEH (kept local for client+server). */
function getTierForEarningsEH(cumulative: number, tiers: any[]): any {
  const sorted = [...(tiers || [])].sort(
    (a, b) => (a.minEarnings ?? 0) - (b.minEarnings ?? 0),
  );
  if (sorted.length === 0) {
    return {
      id: 'tier_fallback',
      name: 'Default',
      minEarnings: 0,
      maxEarnings: null,
      sharePercentage: 25,
      color: '#94a3b8',
    };
  }
  const match = sorted.find((t) => {
    if (t.maxEarnings === null || t.maxEarnings === undefined) {
      return cumulative >= t.minEarnings;
    }
    return cumulative >= t.minEarnings && cumulative < t.maxEarnings;
  });
  return match || sorted[0];
}

export type TripCashLike = {
  date?: string;
  cashCollected?: number;
  paymentMethod?: string;
  platform?: string;
  amount?: number;
  status?: string;
};

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function fareGross(e: LedgerFareLike): number {
  if (Number.isFinite(e.grossAmount)) return Math.abs(Number(e.grossAmount));
  return Math.abs(Number(e.netAmount) || 0);
}

function ymd(d: string | undefined): string {
  return String(d || '').slice(0, 10);
}

function monthStartYmd(periodAnchor: string): string {
  return `${periodAnchor.slice(0, 7)}-01`;
}

function monthEndYmd(periodAnchor: string): string {
  const [y, m] = periodAnchor.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${periodAnchor.slice(0, 7)}-${String(last).padStart(2, '0')}`;
}

/** Week gross + MTD-tier Driver Share (same as /ledger/driver-earnings-history). */
export function computeWeekCommissionShare(params: {
  fareEntries: LedgerFareLike[];
  tipEntries?: LedgerFareLike[];
  periodAnchor: string;
  periodEnd: string;
  tiers: Array<{
    id?: string;
    name?: string;
    minEarnings?: number;
    maxEarnings?: number | null;
    sharePercentage?: number;
    color?: string;
  }>;
}): {
  grossRevenue: number;
  tips: number;
  earningsGross: number;
  tripCount: number;
  driverShare: number;
  fleetShare: number;
  driverSharePercent: number;
  tierId: string;
  tierName: string;
} {
  const { fareEntries, tipEntries = [], periodAnchor, periodEnd, tiers } = params;
  const weekFares = fareEntries.filter((e) => {
    const d = ymd(e.date);
    return d >= periodAnchor && d <= periodEnd;
  });
  const grossRevenue = round2(weekFares.reduce((s, e) => s + fareGross(e), 0));
  const tripCount = weekFares.length;

  const tips = round2(
    tipEntries
      .filter((e) => {
        const d = ymd(e.date);
        return d >= periodAnchor && d <= periodEnd;
      })
      .reduce((s, e) => s + Math.abs(Number(e.netAmount) || fareGross(e)), 0),
  );

  const mStart = monthStartYmd(periodAnchor);
  const mEnd = monthEndYmd(periodAnchor);
  const cumulativeCap = periodEnd < mEnd ? periodEnd : mEnd;
  const cumulativeEarnings = fareEntries.reduce((s, e) => {
    const d = ymd(e.date);
    if (d >= mStart && d <= cumulativeCap) return s + fareGross(e);
    return s;
  }, 0);

  const tier = getTierForEarningsEH(cumulativeEarnings, tiers || []);
  const pct = Number(tier.sharePercentage) || 0;
  const driverShare = round2(grossRevenue * (pct / 100));
  const fleetShare = round2(grossRevenue - driverShare);
  // Settlement earningsGross = fares + tips (share still from fares only, matching EH).
  const earningsGross = round2(grossRevenue + tips);

  return {
    grossRevenue,
    tips,
    earningsGross,
    tripCount,
    driverShare,
    fleetShare,
    driverSharePercent: pct,
    tierId: String(tier.id || 'tier_fallback'),
    tierName: String(tier.name || 'Default'),
  };
}

/**
 * Passenger cash + Settlement-Week Log Cash returned.
 * Uber cash prefers ledger payout_cash; else trip physical cash fallback.
 */
export function computeWeekCashBase(params: {
  periodAnchor: string;
  periodEnd: string;
  trips: TripCashLike[];
  transactions: Array<{
    date?: string;
    amount?: number;
    category?: string;
    type?: string;
    description?: string;
    paymentMethod?: string;
    status?: string;
    metadata?: { workPeriodStart?: string };
  }>;
  /** Ledger/financial payout_cash amounts dated in this week. */
  uberPayoutCash?: number;
}): {
  passengerCash: number;
  cashReturned: number;
  nonUberTripCash: number;
  uberCash: number;
} {
  const { periodAnchor, periodEnd, trips, transactions, uberPayoutCash = 0 } = params;

  let nonUberTripCash = 0;
  let uberTripCashFallback = 0;
  for (const t of trips || []) {
    const d = ymd(t.date);
    if (!(d >= periodAnchor && d <= periodEnd)) continue;
    const status = String(t.status || '').toLowerCase();
    if (status.includes('cancel')) continue;
    const cash = getTripPhysicalCashCollected(t as any);
    if (cash < 0.005) continue;
    if (normalizePlatform(t.platform) === 'Uber') uberTripCashFallback += cash;
    else nonUberTripCash += cash;
  }

  const uberFromLedger = Math.abs(Number(uberPayoutCash) || 0) > 0.005;
  const uberCash = uberFromLedger ? round2(Math.abs(Number(uberPayoutCash) || 0)) : round2(uberTripCashFallback);
  const passengerCash = round2(uberCash + nonUberTripCash);

  const cashReturned = round2(
    (transactions || [])
      .filter((t) => isCashReturnedForWeek(t as any, periodAnchor))
      .reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0),
  );

  return {
    passengerCash,
    cashReturned,
    nonUberTripCash: round2(nonUberTripCash),
    uberCash,
  };
}
