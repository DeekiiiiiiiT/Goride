/**
 * One statement card per platform / driver / week.
 * Earnings lines come from trip facts. Payout lines come from ledger rows.
 * Cash is taken from exactly one source.
 */
import { round2 } from './money.ts';
import { STATEMENT_TOLL_RECON_EPS } from './statementTollNetting.ts';

export type StatementTripRollup = {
  driverId: string | null;
  platform: string;
  totalEarnings: number;
  fare: number;
  cancellation: number;
  timeAtStop: number;
  /** Null until the importer stores UberX Priority. The card then uses the residual. */
  priority: number | null;
  waitTime: number;
  tips: number;
  otherFare: number;
  tollRefundTrips: number;
  /** Absolute trip cash. Used only when this driver-week has no payout_cash row. */
  cashCollectedTrips: number;
  completedTrips: number;
  distanceKm: number;
  /** Stored platform fee. Null when this platform has no commission on the trips. */
  platformFee?: number | null;
  commissionRecorded?: boolean;
};

export type StatementLedgerEvent = {
  eventType?: string | null;
  netAmount?: number | null;
  driverId?: string | null;
  date?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  paymentMethod?: string | null;
  sourceFileHash?: string | null;
  createdAt?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type StatementTieState = 'ties' | 'off' | 'not_checked';

export type StatementCardModel = {
  platform: string;
  driverId: string | null;
  periodStart: string;
  periodEnd: string;
  sourceType: 'computed';
  totalEarnings: number;
  fare: number;
  fareBlock: number;
  cancellation: number;
  timeAtStop: number;
  priority: number;
  prioritySource: 'parsed' | 'residual';
  waitTime: number;
  tips: number;
  otherFare: number;
  /** Kept at 0. Payments-driver "Promotions" is already inside trip fare. */
  promotions: number;
  showPromotions: boolean;
  tollRefund: number;
  tollRefundCrossCheck: number;
  tollRefundDifference: number;
  periodAdjustments: number;
  carriedFromWeeks: string[];
  cashCollected: number;
  cashSource: 'payout_cash' | 'trip_cash' | 'none';
  bankTransfer: number;
  bankSource: 'statement_net' | 'computed';
  actualDeposit: number | null;
  actualDepositDate: string | null;
  netEarnings: number;
  /** Null when no bank row was compared. */
  tieOutDifference: number | null;
  ties: boolean;
  tieState: StatementTieState;
  platformFee: number | null;
  commissionRecorded: boolean;
  importedAt: string | null;
  driverName?: string | null;
  tripCount: number;
  distanceKm: number;
  distanceLabel: 'trip activity';
  importFileHash: string | null;
  /** Fare block, so older earnings rows still add up. */
  netFare: number;
  platformTollCredits: number;
  tollStory: 'uber_csv_credits' | 'no_platform_tolls' | 'trip_toll_expense';
  totalRefundsExpenses: number;
  totalPayout: number;
  payoutObserved: boolean;
  payoutReconciliationGap: number;
};

const EPS = STATEMENT_TOLL_RECON_EPS;

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function meta(e: StatementLedgerEvent): Record<string, unknown> {
  return e.metadata && typeof e.metadata === 'object' ? e.metadata : {};
}

function ymd(value: unknown): string {
  return String(value || '').slice(0, 10);
}

export function addIsoDays(day: string, days: number): string {
  const [y, m, d] = day.split('-').map(Number);
  if (!y || !m || !d) return day;
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** Monday bank deposit pays the Monday–Sunday that ended the day before. */
export function earningWeekForDeposit(depositYmd: string): { periodStart: string; periodEnd: string } {
  return {
    periodStart: addIsoDays(depositYmd, -7),
    periodEnd: addIsoDays(depositYmd, -1),
  };
}

function bankRole(e: StatementLedgerEvent): 'statement_net' | 'actual_deposit' | 'driver_share' | 'other' {
  const m = meta(e);
  const role = String(m.bankRole || '');
  if (role === 'statement_net' || role === 'org_deposit') return 'statement_net';
  if (role === 'actual_deposit') return 'actual_deposit';
  if (role === 'driver_share') return 'driver_share';
  const driverId = String(e.driverId || '');
  if (driverId.startsWith('00000000')) return 'actual_deposit';
  if (String(m.recipient || '') === 'org' || driverId === 'org-bank') return 'statement_net';
  return 'other';
}

export function emptyTripRollup(platform: string, driverId: string | null = null): StatementTripRollup {
  return {
    driverId,
    platform,
    totalEarnings: 0,
    fare: 0,
    cancellation: 0,
    timeAtStop: 0,
    priority: null,
    waitTime: 0,
    tips: 0,
    otherFare: 0,
    tollRefundTrips: 0,
    cashCollectedTrips: 0,
    completedTrips: 0,
    distanceKm: 0,
    platformFee: null,
    commissionRecorded: false,
  };
}

export function sumTripRollups(rows: StatementTripRollup[], platform: string, driverId: string | null): StatementTripRollup {
  const out = emptyTripRollup(platform, driverId);
  let priorityKnown = true;
  let prioritySum = 0;
  let feeSum = 0;
  let feeKnown = rows.length > 0 && (platform === 'Roam' || platform === 'InDrive');
  for (const row of rows) {
    out.totalEarnings = round2(out.totalEarnings + num(row.totalEarnings));
    out.fare = round2(out.fare + num(row.fare));
    out.cancellation = round2(out.cancellation + num(row.cancellation));
    out.timeAtStop = round2(out.timeAtStop + num(row.timeAtStop));
    out.waitTime = round2(out.waitTime + num(row.waitTime));
    out.tips = round2(out.tips + num(row.tips));
    out.otherFare = round2(out.otherFare + num(row.otherFare));
    out.tollRefundTrips = round2(out.tollRefundTrips + num(row.tollRefundTrips));
    out.cashCollectedTrips = round2(out.cashCollectedTrips + Math.abs(num(row.cashCollectedTrips)));
    out.completedTrips += num(row.completedTrips);
    out.distanceKm = round2(out.distanceKm + num(row.distanceKm));
    if (row.priority == null) priorityKnown = false;
    else prioritySum = round2(prioritySum + num(row.priority));
    if (row.platformFee == null || row.commissionRecorded === false) feeKnown = false;
    else feeSum = round2(feeSum + num(row.platformFee));
  }
  out.priority = priorityKnown && rows.length > 0 ? prioritySum : null;
  out.platformFee = feeKnown ? feeSum : null;
  out.commissionRecorded = feeKnown;
  return out;
}

function eventsForDriver(events: StatementLedgerEvent[], driverIds: string[] | null): StatementLedgerEvent[] {
  if (!driverIds || driverIds.length === 0) return events;
  const want = new Set(driverIds.map((id) => id.trim().toLowerCase()).filter(Boolean));
  return events.filter((e) => want.has(String(e.driverId || '').trim().toLowerCase()));
}

function pickCash(
  events: StatementLedgerEvent[],
  tripCash: number,
): { amount: number; source: StatementCardModel['cashSource'] } {
  let payout = 0;
  let saw = false;
  for (const e of events) {
    if (String(e.eventType || '') !== 'payout_cash') continue;
    saw = true;
    payout = round2(payout + Math.abs(num(e.netAmount)));
  }
  if (saw) return { amount: payout, source: 'payout_cash' };
  const trip = round2(Math.abs(tripCash));
  if (trip > EPS) return { amount: trip, source: 'trip_cash' };
  return { amount: 0, source: 'none' };
}

function pickToll(events: StatementLedgerEvent[], tripToll: number): { shown: number; cross: number; difference: number } {
  let statement = 0;
  let saw = false;
  for (const e of events) {
    if (String(e.eventType || '') !== 'statement_line') continue;
    if (String(meta(e).lineCode || '') !== 'REFUNDS_TOLL') continue;
    saw = true;
    statement = round2(statement + Math.abs(num(e.netAmount)));
  }
  const cross = round2(Math.abs(tripToll));
  if (saw) return { shown: statement, cross, difference: round2(cross - statement) };
  return { shown: cross, cross, difference: 0 };
}

function pickAdjustments(events: StatementLedgerEvent[]): { amount: number; carried: string[] } {
  let amount = 0;
  const carried: string[] = [];
  for (const e of events) {
    if (String(e.eventType || '') !== 'prior_period_adjustment') continue;
    amount = round2(amount + num(e.netAmount));
    const from = String(meta(e).carriedFromWeek || '').slice(0, 10);
    if (from && !carried.includes(from)) carried.push(from);
  }
  return { amount, carried };
}

function periodOf(e: StatementLedgerEvent): { start: string; end: string } {
  return {
    start: ymd(e.periodStart || meta(e).periodStart),
    end: ymd(e.periodEnd || meta(e).periodEnd),
  };
}

function overlapsWeek(start: string, end: string, periodStart: string, periodEnd: string): boolean {
  return !!(start && end && start <= periodEnd && end >= periodStart);
}

/** A deposit belongs to this week by its saved earning week, or by matching the statement net. */
function depositMatchesWeek(
  e: StatementLedgerEvent,
  periodStart: string,
  periodEnd: string,
  statementNet: number,
): boolean {
  const period = periodOf(e);
  if (overlapsWeek(period.start, period.end, periodStart, periodEnd)) return true;
  if (period.start && !period.end && period.start >= periodStart && period.start <= periodEnd) return true;
  const mag = Math.abs(num(e.netAmount));
  if (Math.abs(mag - Math.abs(statementNet)) >= EPS) return false;
  const day = ymd(e.date);
  const lateEnd = addIsoDays(periodEnd, 7);
  return !!(day && day >= periodStart && day <= lateEnd);
}

function pickBank(
  events: StatementLedgerEvent[],
  scope: 'fleet' | 'driver',
  periodStart: string,
  periodEnd: string,
): {
  statementNet: number;
  actual: number | null;
  actualDate: string | null;
  observed: boolean;
} {
  let statementNet = 0;
  let sawStatement = false;
  const deposits: StatementLedgerEvent[] = [];
  for (const e of events) {
    if (String(e.eventType || '') !== 'payout_bank') continue;
    const role = bankRole(e);
    const mag = Math.abs(num(e.netAmount));
    if (role === 'actual_deposit') {
      deposits.push(e);
      continue;
    }
    if (scope === 'fleet' && role === 'statement_net') {
      sawStatement = true;
      statementNet = round2(statementNet + mag);
    }
    if (scope === 'driver' && role === 'driver_share') {
      sawStatement = true;
      statementNet = round2(statementNet + mag);
    }
  }
  let actual = 0;
  let actualDate: string | null = null;
  let sawActual = false;
  for (const e of deposits) {
    if (!depositMatchesWeek(e, periodStart, periodEnd, statementNet)) continue;
    sawActual = true;
    actual = round2(actual + Math.abs(num(e.netAmount)));
    const day = ymd(e.date);
    if (day && (!actualDate || day > actualDate)) actualDate = day;
  }
  return {
    statementNet,
    actual: sawActual ? actual : null,
    actualDate,
    observed: sawStatement,
  };
}

function ledgerEarningsFallback(events: StatementLedgerEvent[]): Pick<
  StatementTripRollup,
  'totalEarnings' | 'fare' | 'tips' | 'completedTrips' | 'cashCollectedTrips'
> {
  let fare = 0;
  let tips = 0;
  const tripIds = new Set<string>();
  for (const e of events) {
    const type = String(e.eventType || '');
    const m = meta(e);
    const reversal = m.reversal === true || m.reversal === 'true';
    const signed = reversal ? -Math.abs(num(e.netAmount)) : num(e.netAmount);
    if (type === 'fare_earning') {
      fare = round2(fare + signed);
      const tripId = String(m.tripId || '').trim();
      if (!reversal && tripId) tripIds.add(tripId.toLowerCase());
    } else if (type === 'tip') {
      tips = round2(tips + signed);
    }
  }
  return {
    totalEarnings: round2(fare + tips),
    fare,
    tips,
    completedTrips: tripIds.size,
    cashCollectedTrips: 0,
  };
}

export function assemblePlatformStatement(args: {
  platform: string;
  periodStart: string;
  periodEnd: string;
  rollup: StatementTripRollup | null;
  events: StatementLedgerEvent[];
  /** Fleet card uses the organisation deposit. Driver card uses that driver's bank share. */
  scope?: 'fleet' | 'driver';
  /** Roam id plus Uber / InDrive ids for the same person. */
  driverIds?: string[] | null;
  driverName?: string | null;
}): StatementCardModel {
  const platform = args.platform;
  const scope = args.scope ?? (args.rollup?.driverId ? 'driver' : 'fleet');
  const driverIds = scope === 'driver'
    ? (args.driverIds && args.driverIds.length > 0
      ? args.driverIds
      : (args.rollup?.driverId ? [args.rollup.driverId] : []))
    : null;
  const events = eventsForDriver(args.events, driverIds);
  const rollup = args.rollup;
  const fallback = rollup ? null : ledgerEarningsFallback(events);

  const totalEarnings = round2(rollup ? rollup.totalEarnings : fallback!.totalEarnings);
  const fare = round2(rollup ? rollup.fare : fallback!.fare);
  const cancellation = round2(rollup?.cancellation ?? 0);
  const timeAtStop = round2(rollup?.timeAtStop ?? 0);
  const waitTime = round2(rollup?.waitTime ?? 0);
  const tips = round2(rollup ? rollup.tips : fallback!.tips);
  const otherFare = round2(rollup?.otherFare ?? 0);
  const fareBlockWithoutPriority = round2(fare + cancellation + timeAtStop + waitTime + otherFare);
  let priority = rollup?.priority ?? null;
  let prioritySource: StatementCardModel['prioritySource'] = 'parsed';
  if (priority == null) {
    prioritySource = 'residual';
    priority = round2(totalEarnings - fareBlockWithoutPriority - tips);
  } else {
    priority = round2(priority);
  }
  const fareBlock = round2(fareBlockWithoutPriority + priority);

  const toll = pickToll(events, rollup?.tollRefundTrips ?? 0);
  const cash = pickCash(events, rollup?.cashCollectedTrips ?? 0);
  const adjustments = pickAdjustments(events);
  const bank = pickBank(events, scope, args.periodStart, args.periodEnd);
  const netEarnings = round2(totalEarnings + toll.shown + adjustments.amount - cash.amount);
  const bankTransfer = bank.observed ? bank.statementNet : netEarnings;
  const tieOutDifference = bank.observed ? round2(bankTransfer - netEarnings) : null;
  const tieState: StatementCardModel['tieState'] = !bank.observed
    ? 'not_checked'
    : Math.abs(tieOutDifference ?? 0) < EPS
      ? 'ties'
      : 'off';
  const ties = tieState === 'ties';
  const tripCount = rollup ? rollup.completedTrips : fallback!.completedTrips;
  const importFileHash = events.map((e) => String(e.sourceFileHash || meta(e).sourceFileHash || '')).find((h) => h.length > 0) || null;
  const importedAt = events
    .map((e) => String(e.createdAt || meta(e).importedAt || ''))
    .filter((value) => value.length > 0)
    .sort()
    .at(-1) || null;
  const commissionRecorded = rollup?.commissionRecorded === true && rollup.platformFee != null;
  const platformFee = commissionRecorded ? round2(num(rollup?.platformFee)) : null;

  const tollStory: StatementCardModel['tollStory'] =
    toll.shown > EPS ? 'uber_csv_credits' : 'no_platform_tolls';

  return {
    platform,
    driverId: rollup?.driverId ?? null,
    driverName: args.driverName ?? null,
    periodStart: args.periodStart,
    periodEnd: args.periodEnd,
    sourceType: 'computed',
    totalEarnings,
    fare,
    fareBlock,
    cancellation,
    timeAtStop,
    priority,
    prioritySource,
    waitTime,
    tips,
    otherFare,
    promotions: 0,
    showPromotions: false,
    tollRefund: toll.shown,
    tollRefundCrossCheck: toll.cross,
    tollRefundDifference: toll.difference,
    periodAdjustments: adjustments.amount,
    carriedFromWeeks: adjustments.carried,
    cashCollected: cash.amount,
    cashSource: cash.source,
    bankTransfer,
    bankSource: bank.observed ? 'statement_net' : 'computed',
    actualDeposit: bank.actual,
    actualDepositDate: bank.actualDate,
    netEarnings,
    tieOutDifference,
    ties,
    tieState,
    platformFee,
    commissionRecorded,
    importedAt,
    tripCount,
    distanceKm: round2(rollup?.distanceKm ?? 0),
    distanceLabel: 'trip activity',
    importFileHash,
    netFare: fareBlock,
    platformTollCredits: toll.shown,
    tollStory,
    totalRefundsExpenses: toll.shown,
    totalPayout: round2(cash.amount + bankTransfer),
    payoutObserved: bank.observed || cash.source === 'payout_cash',
    payoutReconciliationGap: ties ? 0 : (tieOutDifference ?? 0),
  };
}
