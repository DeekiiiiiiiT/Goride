import { describe, expect, it } from 'vitest';
import {
  computeFuelFleetLossNetting,
  computeFuelFleetLossForPeriod,
  fuelRecoveredWashedMemo,
} from './fuelFleetLossNetting';

function expense(overrides: Record<string, unknown> = {}) {
  return {
    eventType: 'fuel_expense',
    date: '2026-02-10',
    driverId: 'd1',
    sourceType: 'transaction',
    sourceId: 'fe1',
    netAmount: 1000,
    grossAmount: 1000,
    direction: 'outflow',
    ...overrides,
  };
}

describe('computeFuelFleetLossNetting', () => {
  it('nets gross minus driver-share offsets to fleet loss', () => {
    const events = [
      expense({ sourceId: 'fe1', netAmount: 1000 }),
      expense({ sourceId: 'fe2', netAmount: 500, date: '2026-02-11' }),
      {
        eventType: 'fuel_charge_offset',
        date: '2026-02-10',
        sourceId: 'fe1',
        netAmount: 300,
        direction: 'inflow',
      },
      {
        eventType: 'fuel_charge_offset',
        date: '2026-02-11',
        sourceId: 'fe2',
        netAmount: 150,
        direction: 'inflow',
      },
    ];
    const netting = computeFuelFleetLossNetting(events);
    expect(netting.gross).toBe(1500);
    expect(netting.recovered).toBe(450);
    expect(netting.net).toBe(1050);
    expect(fuelRecoveredWashedMemo(netting)).toBe(450);
  });

  it('fully offset period nets to $0 but keeps recovered memo', () => {
    const events = [
      expense(),
      {
        eventType: 'fuel_charge_offset',
        date: '2026-02-10',
        sourceId: 'fe1',
        netAmount: 1000,
        direction: 'inflow',
      },
    ];
    const netting = computeFuelFleetLossNetting(events);
    expect(netting.net).toBe(0);
    expect(fuelRecoveredWashedMemo(netting)).toBe(1000);
  });

  it('reinstatement puts loss back on the books', () => {
    const events = [
      expense(),
      {
        eventType: 'fuel_charge_offset',
        date: '2026-02-10',
        sourceId: 'fe1',
        netAmount: 400,
        direction: 'inflow',
      },
      {
        eventType: 'fuel_charge_offset',
        date: '2026-02-10',
        sourceId: 'fe1',
        netAmount: 400,
        direction: 'outflow',
      },
    ];
    const netting = computeFuelFleetLossNetting(events);
    expect(netting.net).toBe(1000);
    expect(fuelRecoveredWashedMemo(netting)).toBeUndefined();
  });

  it('floors net at $0 when recoveries exceed gross', () => {
    const events = [
      expense({ netAmount: 100 }),
      {
        eventType: 'fuel_charge_offset',
        date: '2026-02-10',
        sourceId: 'fe1',
        netAmount: 150,
        direction: 'inflow',
      },
    ];
    const netting = computeFuelFleetLossNetting(events);
    expect(netting.net).toBe(0);
    expect(netting.clipped).toBe(true);
  });

  it('ignores fuel_reimbursement (wallet path)', () => {
    const events = [
      expense(),
      {
        eventType: 'fuel_reimbursement',
        date: '2026-02-10',
        netAmount: 200,
        direction: 'inflow',
      },
    ];
    expect(computeFuelFleetLossNetting(events).net).toBe(1000);
  });

  it('filters by period', () => {
    const events = [
      expense({ date: '2026-01-15' }),
      expense({ date: '2026-02-10', sourceId: 'fe2', netAmount: 200 }),
    ];
    expect(computeFuelFleetLossForPeriod(events, '2026-02-01', '2026-02-28').net).toBe(200);
  });
});
