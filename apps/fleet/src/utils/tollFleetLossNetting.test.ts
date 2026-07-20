import { describe, expect, it } from 'vitest';
import {
  computeTollFleetLossNetting,
  computeTollFleetLossForPeriod,
  tollRecoveredWashedMemo,
} from './tollFleetLossNetting';
import { buildPnLFromCanonicalEvents, sumExpenseRowsFromEvents } from '../components/business-finance/businessFinancePnL';
import type { BusinessFinancePeriod } from '../components/business-finance/types';

const period: BusinessFinancePeriod = {
  preset: 'custom',
  startYmd: '2026-02-01',
  endYmd: '2026-02-28',
};

function charge(overrides: Record<string, unknown> = {}) {
  return {
    eventType: 'toll_charge',
    date: '2026-02-10',
    driverId: 'd1',
    sourceType: 'transaction',
    sourceId: 't1',
    netAmount: 100,
    grossAmount: 100,
    direction: 'outflow',
    ...overrides,
  };
}

describe('computeTollFleetLossNetting', () => {
  it('matches P&L Tolls for the same events', () => {
    const events = [
      charge({ sourceType: 'trip', sourceId: 'trip-1', netAmount: 6090, grossAmount: 6090 }),
      {
        eventType: 'toll_charge_offset',
        date: '2026-02-10',
        driverId: 'd1',
        sourceType: 'trip',
        sourceId: 'trip-1',
        netAmount: 6090,
        direction: 'inflow',
      },
      charge({ id: 'tag', sourceId: 'tag-1', netAmount: 1045, grossAmount: 1045 }),
    ];
    const netting = computeTollFleetLossNetting(events);
    const pnl = buildPnLFromCanonicalEvents(events, period);
    expect(netting.net).toBe(1045);
    expect(-(pnl.lines.find((l) => l.id === 'tolls')!.amount ?? 0)).toBe(netting.net);
    expect(computeTollFleetLossForPeriod(events, '2026-02-01', '2026-02-28').net).toBe(1045);
  });

  it('fully washed period nets to $0 but keeps recovered memo', () => {
    const events = [
      charge({ sourceType: 'trip', sourceId: 'trip-1' }),
      {
        eventType: 'toll_charge_offset',
        date: '2026-02-10',
        driverId: 'd1',
        sourceType: 'trip',
        sourceId: 'trip-1',
        netAmount: 100,
        direction: 'inflow',
      },
    ];
    const netting = computeTollFleetLossNetting(events);
    expect(netting.net).toBe(0);
    expect(tollRecoveredWashedMemo(netting)).toBe(100);
    const pnl = buildPnLFromCanonicalEvents(events, period);
    expect(pnl.lines.find((l) => l.id === 'tolls')!.amount).toBe(-0);
    expect(pnl.tollBreakdown?.fleetLoss).toBe(0);
    expect(pnl.tollBreakdown?.alreadyCovered).toBe(100);
    // Overview must not treat net $0 as empty ledger
    const agg = sumExpenseRowsFromEvents(events, period);
    expect(agg.tollEventCount).toBeGreaterThan(0);
    expect(agg.tolls).toBe(0);
  });

  it('does not treat a top_up-shaped refund as fleet recovery when absent from events', () => {
    // Go-forward: top_ups are not emitted as toll_refund. A plain charge stays a loss.
    const events = [charge()];
    expect(computeTollFleetLossNetting(events).net).toBe(100);
  });
});
