import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { assemblePlatformStatement, type StatementLedgerEvent, type StatementTripRollup } from './statementCard.ts';
import { classifyStatementControl, KNOWN_FARE_DRIFT_WEEKS } from './statementControl.ts';

/** Uber Fleet screenshots. The card must match these lines. */
const OCT_12: StatementTripRollup = {
  driverId: 'kenny',
  platform: 'Uber',
  totalEarnings: 53693.27,
  fare: 48517.41,
  cancellation: 52.5,
  timeAtStop: 1750.44,
  priority: 1538.37,
  waitTime: 1074.55,
  tips: 760,
  otherFare: 0,
  tollRefundTrips: 2535,
  cashCollectedTrips: 22470.65,
  completedTrips: 45,
  distanceKm: 526.44,
};

const OCT_5: StatementTripRollup = {
  driverId: 'kenny',
  platform: 'Uber',
  totalEarnings: 81613.19,
  fare: 76784.71,
  cancellation: 63,
  timeAtStop: 119.63,
  priority: 1820.31,
  waitTime: 1915.54,
  tips: 910,
  otherFare: 0,
  tollRefundTrips: 4910,
  cashCollectedTrips: 19139.16,
  completedTrips: 61,
  distanceKm: 857.1,
};

function doubledWeek(args: {
  cash: number;
  bank: number;
  tollStatement: number;
  tollTripsWrong?: number;
  extraFareRows?: number;
  fileHash: string;
  periodStart: string;
  periodEnd: string;
  depositDate: string;
  decoyAmount?: number;
  decoyDate?: string;
}): StatementLedgerEvent[] {
  const events: StatementLedgerEvent[] = [
    {
      eventType: 'payout_cash',
      netAmount: args.cash,
      driverId: 'kenny',
      metadata: { platform: 'Uber' },
    },
    {
      eventType: 'fare_earning',
      netAmount: args.cash,
      driverId: 'kenny',
      paymentMethod: 'Cash',
      metadata: { cashCollected: args.cash, tripId: 'should-not-add' },
    },
    {
      eventType: 'payout_bank',
      netAmount: args.bank,
      driverId: 'org-bank',
      date: args.periodStart,
      periodStart: args.periodStart,
      periodEnd: args.periodEnd,
      metadata: { bankRole: 'statement_net', recipient: 'org', sourceFileHash: args.fileHash },
      sourceFileHash: args.fileHash,
    },
    {
      eventType: 'payout_bank',
      netAmount: args.bank,
      driverId: '00000000-0000-0000-0000-000000000000',
      date: args.depositDate,
      metadata: {},
    },
  ];
  if (args.decoyAmount != null && args.decoyDate) {
    events.push({
      eventType: 'payout_bank',
      netAmount: args.decoyAmount,
      driverId: '00000000-0000-0000-0000-000000000000',
      date: args.decoyDate,
      metadata: {},
    });
  }
  events.push(
    {
      eventType: 'statement_line',
      netAmount: args.tollStatement,
      driverId: 'kenny',
      metadata: { lineCode: 'REFUNDS_TOLL' },
    },
    {
      eventType: 'promotion',
      netAmount: 171.34,
      driverId: 'kenny',
      metadata: { source: 'payments_driver' },
    },
  );
  for (let i = 0; i < (args.extraFareRows ?? 0); i++) {
    events.push({
      eventType: 'fare_earning',
      netAmount: 1,
      driverId: 'kenny',
      metadata: {},
    });
  }
  return events;
}

describe('Uber statement golden weeks', () => {
  it('Oct 12–18 matches the Uber app, including single cash and a zero tie-out', () => {
    const card = assemblePlatformStatement({
      platform: 'Uber',
      periodStart: '2026-10-12',
      periodEnd: '2026-10-18',
      rollup: OCT_12,
      scope: 'fleet',
      events: doubledWeek({
        cash: 22470.65,
        bank: 33757.62,
        tollStatement: 2535,
        fileHash: 'e041e5abc',
        periodStart: '2026-10-12',
        periodEnd: '2026-10-18',
        depositDate: '2026-10-19',
        decoyAmount: 67384.03,
        decoyDate: '2026-10-12',
      }),
    });
    expect(card.totalEarnings).toBe(53693.27);
    expect(card.fare).toBe(48517.41);
    expect(card.cancellation).toBe(52.5);
    expect(card.timeAtStop).toBe(1750.44);
    expect(card.priority).toBe(1538.37);
    expect(card.waitTime).toBe(1074.55);
    expect(card.tips).toBe(760);
    expect(card.tollRefund).toBe(2535);
    expect(card.cashCollected).toBe(22470.65);
    expect(card.cashSource).toBe('payout_cash');
    expect(card.totalPayout).toBe(56228.27);
    expect(card.netEarnings).toBe(33757.62);
    expect(card.tieOutDifference).toBe(0);
    expect(card.ties).toBe(true);
    expect(card.tripCount).toBe(45);
    expect(card.promotions).toBe(0);
    expect(card.importFileHash).toBe('e041e5abc');
    expect(card.actualDeposit).toBe(33757.62);
    expect(card.actualDepositDate).toBe('2026-10-19');
    expect(card.tieState).toBe('ties');
  });

  it('Oct 5–11 uses the statement toll, not the inflated trip sum, and ignores the extra fare row', () => {
    const card = assemblePlatformStatement({
      platform: 'Uber',
      periodStart: '2026-10-05',
      periodEnd: '2026-10-11',
      rollup: { ...OCT_5, tollRefundTrips: 4980 },
      scope: 'fleet',
      events: doubledWeek({
        cash: 19139.16,
        bank: 67384.03,
        tollStatement: 4910,
        extraFareRows: 1,
        fileHash: 'oct5',
        periodStart: '2026-10-05',
        periodEnd: '2026-10-11',
        depositDate: '2026-10-12',
      }),
    });
    expect(card.totalEarnings).toBe(81613.19);
    expect(card.fare).toBe(76784.71);
    expect(card.cancellation).toBe(63);
    expect(card.timeAtStop).toBe(119.63);
    expect(card.priority).toBe(1820.31);
    expect(card.waitTime).toBe(1915.54);
    expect(card.tips).toBe(910);
    expect(card.tollRefund).toBe(4910);
    expect(card.tollRefundDifference).toBe(70);
    expect(card.cashCollected).toBe(19139.16);
    expect(card.netEarnings).toBe(67384.03);
    expect(card.ties).toBe(true);
    expect(card.tripCount).toBe(61);
    expect(card.payoutReconciliationGap).toBe(0);
  });

  it('does not add next week’s bank row to this week’s tie', () => {
    const events = doubledWeek({
      cash: 19139.16,
      bank: 67384.03,
      tollStatement: 4910,
      fileHash: 'oct5',
      periodStart: '2026-10-05',
      periodEnd: '2026-10-11',
      depositDate: '2026-10-12',
    });
    events.push({
      eventType: 'payout_bank',
      netAmount: 33757.62,
      driverId: 'org-bank',
      date: '2026-10-13',
      periodStart: '2026-10-12',
      periodEnd: '2026-10-18',
      metadata: { bankRole: 'statement_net', recipient: 'org' },
    });
    const card = assemblePlatformStatement({
      platform: 'Uber',
      periodStart: '2026-10-05',
      periodEnd: '2026-10-11',
      rollup: OCT_5,
      scope: 'fleet',
      events,
    });
    expect(card.netEarnings).toBe(67384.03);
    expect(card.tieState).toBe('ties');
    expect(card.tieOutDifference).toBe(0);
    expect(card.actualDeposit).toBe(67384.03);
    expect(card.actualDepositDate).toBe('2026-10-12');
  });

  it('uses the residual for UberX Priority until the column is parsed', () => {
    const card = assemblePlatformStatement({
      platform: 'Uber',
      periodStart: '2026-10-12',
      periodEnd: '2026-10-18',
      rollup: { ...OCT_12, priority: null },
      events: doubledWeek({
        cash: 22470.65,
        bank: 33757.62,
        tollStatement: 2535,
        fileHash: 'e041e5abc',
        periodStart: '2026-10-12',
        periodEnd: '2026-10-18',
        depositDate: '2026-10-19',
      }),
    });
    expect(card.prioritySource).toBe('residual');
    expect(card.priority).toBe(1538.37);
  });

  it('driver settlements do not read the statement builder', () => {
    const src = readFileSync(new URL('./driverPeriodSettlement.ts', import.meta.url), 'utf8');
    expect(src.includes('buildOrgStatementSummaries')).toBe(false);
    expect(src.includes('statementEarningDelta')).toBe(false);
    expect(KNOWN_FARE_DRIFT_WEEKS).toContain('2026-10-12');
    expect(classifyStatementControl({
      week: '2026-10-12',
      kind: 'fare',
      difference: -52.5,
    })).toBe('historical');
    expect(classifyStatementControl({
      week: '2026-10-19',
      kind: 'fare',
      difference: 10,
    })).toBe('unexplained');
  });

  it('does not call a missing bank row a tie', () => {
    const card = assemblePlatformStatement({
      platform: 'Uber',
      periodStart: '2026-10-12',
      periodEnd: '2026-10-18',
      rollup: OCT_12,
      scope: 'fleet',
      events: [],
    });
    expect(card.tieState).toBe('not_checked');
    expect(card.ties).toBe(false);
    expect(card.tieOutDifference).toBeNull();
    expect(card.bankSource).toBe('computed');
  });

  it('keeps a driver payout when the trip id and the bank id are aliases', () => {
    const card = assemblePlatformStatement({
      platform: 'Uber',
      periodStart: '2026-10-12',
      periodEnd: '2026-10-18',
      scope: 'driver',
      driverIds: ['73e5b1dc-roam', '52ff47da-uber'],
      driverName: 'Kenny',
      rollup: { ...OCT_12, driverId: '73e5b1dc-roam' },
      events: [
        {
          eventType: 'payout_cash',
          netAmount: 22470.65,
          driverId: '52ff47da-uber',
          metadata: { platform: 'Uber' },
        },
        {
          eventType: 'payout_bank',
          netAmount: 33757.62,
          driverId: '52ff47da-uber',
          metadata: { bankRole: 'driver_share' },
        },
      ],
    });
    expect(card.cashCollected).toBe(22470.65);
    expect(card.cashSource).toBe('payout_cash');
    expect(card.tieState).toBe('ties');
    expect(card.driverName).toBe('Kenny');
  });

  it('ignores an organisation id that has no bank role', () => {
    const card = assemblePlatformStatement({
      platform: 'Uber',
      periodStart: '2026-10-12',
      periodEnd: '2026-10-18',
      rollup: OCT_12,
      scope: 'fleet',
      events: [{
        eventType: 'payout_bank',
        netAmount: 33757.62,
        driverId: '73dfc14d-3798-4a00-8d86-b2a3eb632f54',
        date: '2026-10-12',
        metadata: {},
      }],
    });
    expect(card.tieState).toBe('not_checked');
    expect(card.actualDeposit).toBeNull();
  });
});
