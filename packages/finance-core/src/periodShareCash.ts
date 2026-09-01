import { getTripPhysicalCashCollected } from './tripPhysicalCash.ts';
import {
  isCashReturnedForWeek,
  isCashWriteOffForWeek,
  isSettlementPaidForWeek,
} from './driverCashPayment.ts';
import { normalizePlatform } from './normalizePlatform.ts';
import { round2, MONEY_EPS } from './money.ts';
import { fleetCalendarDay, DEFAULT_FLEET_TZ } from './periodKey.ts';

export type LedgerFareLike = {
  date?: string;
  eventType?: string;
  grossAmount?: number;
  netAmount?: number;
};

export type QuotaConfigLike = {
  weekly?: { enabled?: boolean; amount?: number };
} | null;

/** Exported for unit tests — tier lookup must fall back to highest band, not lowest. */
export function getTierForEarningsEH(cumulative: number, tiers: any[]): any {
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
  // Past all finite ceilings → highest tier (not sorted[0]).
  return match || sorted[sorted.length - 1];
}

export type TripCashLike = {
  date?: string;
  cashCollected?: number;
  paymentMethod?: string;
  platform?: string;
  amount?: number;
  status?: string;
};

function fareGross(e: LedgerFareLike): number {
  if (Number.isFinite(e.grossAmount)) return Math.abs(Number(e.grossAmount));
  return Math.abs(Number(e.netAmount) || 0);
}

function dayKey(d: string | undefined, timezone: string): string {
  return fleetCalendarDay(String(d || ''), timezone);
}

function monthStartYmd(periodAnchor: string): string {
  return `${periodAnchor.slice(0, 7)}-01`;
}

/** Tips count toward weekly quota; paid to driver only if quota is met (or quota is off). */
export function resolveTipsAgainstQuota(params: {
  tips: number;
  quotaProgress: number;
  quotaConfig?: QuotaConfigLike;
}): {
  quotaTarget: number | null;
  quotaPercent: number | null;
  quotaMet: boolean;
  tipsPaidToDriver: number;
  tipsWithheld: number;
} {
  const tips = round2(Math.max(0, params.tips || 0));
  const weekly = params.quotaConfig?.weekly;
  const quotaTarget =
    weekly?.enabled && Number(weekly.amount) > 0 ? round2(Number(weekly.amount)) : null;
  const quotaMet = quotaTarget == null || params.quotaProgress + MONEY_EPS >= quotaTarget;
  const quotaPercent =
    quotaTarget != null && quotaTarget > 0
      ? round2((params.quotaProgress / quotaTarget) * 100)
      : null;
  return {
    quotaTarget,
    quotaPercent,
    quotaMet,
    tipsPaidToDriver: quotaMet ? tips : 0,
    tipsWithheld: quotaMet ? 0 : tips,
  };
}

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
  quotaConfig?: QuotaConfigLike;
  /** Fleet calendar timezone for fare/tip day bucketing. */
  timezone?: string;
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
  quotaTarget: number | null;
  quotaPercent: number | null;
  quotaMet: boolean;
  tipsPaidToDriver: number;
  tipsWithheld: number;
} {
  const {
    fareEntries,
    tipEntries = [],
    periodAnchor,
    periodEnd,
    tiers,
    timezone = DEFAULT_FLEET_TZ,
  } = params;
  const weekFares = fareEntries.filter((e) => {
    const d = dayKey(e.date, timezone);
    return d >= periodAnchor && d <= periodEnd;
  });
  const grossRevenue = round2(weekFares.reduce((s, e) => s + fareGross(e), 0));
  const tripCount = weekFares.length;

  const tips = round2(
    tipEntries
      .filter((e) => {
        const d = dayKey(e.date, timezone);
        return d >= periodAnchor && d <= periodEnd;
      })
      .reduce((s, e) => s + Math.abs(Number(e.netAmount) || fareGross(e)), 0),
  );

  // D4: full-week cumulative — do not truncate at month-end.
  const mStart = monthStartYmd(periodAnchor);
  const cumulativeEarnings = fareEntries.reduce((s, e) => {
    const d = dayKey(e.date, timezone);
    if (d >= mStart && d <= periodEnd) return s + fareGross(e);
    return s;
  }, 0);

  const tier = getTierForEarningsEH(cumulativeEarnings, tiers || []);
  const pct = Number(tier.sharePercentage) || 0;
  const driverShare = round2(grossRevenue * (pct / 100));
  const quotaProgress = round2(grossRevenue + tips);
  const quota = resolveTipsAgainstQuota({
    tips,
    quotaProgress,
    quotaConfig: params.quotaConfig,
  });
  // Missed-quota tips belong to fleet (locked product decision).
  const fleetShare = round2(grossRevenue - driverShare + quota.tipsWithheld);
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
    ...quota,
  };
}

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
  uberPayoutCash?: number;
  timezone?: string;
}): {
  passengerCash: number;
  cashReturned: number;
  cashWrittenOff: number;
  settlementPaid: number;
  nonUberTripCash: number;
  uberCash: number;
  uberTripCash: number;
  cashSourceMismatch: number;
} {
  const {
    periodAnchor,
    periodEnd,
    trips,
    transactions,
    uberPayoutCash = 0,
    timezone = DEFAULT_FLEET_TZ,
  } = params;

  let nonUberTripCash = 0;
  let uberTripCashFallback = 0;
  for (const t of trips || []) {
    const d = dayKey(t.date, timezone);
    if (!(d >= periodAnchor && d <= periodEnd)) continue;
    const status = String(t.status || '').toLowerCase();
    if (status.includes('cancel')) continue;
    const cash = getTripPhysicalCashCollected(t);
    if (cash < MONEY_EPS) continue;
    if (normalizePlatform(t.platform) === 'Uber') uberTripCashFallback += cash;
    else nonUberTripCash += cash;
  }

  const uberTripCash = round2(uberTripCashFallback);
  const uberFromLedger = Math.abs(Number(uberPayoutCash) || 0) > MONEY_EPS;
  const uberCash = uberFromLedger
    ? round2(Math.abs(Number(uberPayoutCash) || 0))
    : uberTripCash;
  const passengerCash = round2(uberCash + nonUberTripCash);
  const cashSourceMismatch =
    uberFromLedger && Math.abs(uberCash - uberTripCash) > MONEY_EPS
      ? round2(uberCash - uberTripCash)
      : 0;

  const cashReturned = round2(
    (transactions || [])
      .filter((t) => isCashReturnedForWeek(t, periodAnchor))
      .reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0),
  );

  const cashWrittenOff = round2(
    (transactions || [])
      .filter((t) => isCashWriteOffForWeek(t, periodAnchor))
      .reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0),
  );

  const settlementPaid = round2(
    (transactions || [])
      .filter((t) => isSettlementPaidForWeek(t, periodAnchor))
      .reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0),
  );

  return {
    passengerCash,
    cashReturned,
    cashWrittenOff,
    settlementPaid,
    nonUberTripCash: round2(nonUberTripCash),
    uberCash,
    uberTripCash,
    cashSourceMismatch,
  };
}
