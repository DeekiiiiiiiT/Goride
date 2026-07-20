import { describe, expect, it } from 'vitest';
import { buildPnLFromCanonicalEvents, sumExpenseRowsFromEvents } from './businessFinancePnL';
import type { BusinessFinancePeriod } from './types';

const period: BusinessFinancePeriod = {
  preset: 'custom',
  startYmd: '2026-07-01',
  endYmd: '2026-07-07',
};

function tollCharge(overrides: Record<string, unknown> = {}) {
  return {
    id: overrides.id || 'ev1',
    eventType: 'toll_charge',
    date: '2026-07-02',
    driverId: 'd1',
    sourceType: 'toll_ledger',
    sourceId: 'toll-1',
    netAmount: 100,
    grossAmount: 100,
    direction: 'outflow',
    platform: 'Roam',
    ...overrides,
  };
}

function tollOffset(overrides: Record<string, unknown> = {}) {
  return {
    id: overrides.id || 'ev-offset',
    eventType: 'toll_charge_offset',
    date: '2026-07-02',
    driverId: 'd1',
    sourceType: 'toll_ledger',
    sourceId: 'toll-1',
    netAmount: 100,
    grossAmount: 100,
    direction: 'inflow',
    platform: 'Roam',
    ...overrides,
  };
}

describe('buildPnLFromCanonicalEvents — toll netting', () => {
  it('counts a plain toll_charge with no offset/refund in full', () => {
    const pnl = buildPnLFromCanonicalEvents([tollCharge()], period);
    const tolls = pnl.lines.find((l) => l.id === 'tolls')!;
    expect(tolls.amount).toBe(-100);
    expect(pnl.tollsRecoveredWashed).toBeUndefined();
  });

  it('nets a cash_wash offset to $0', () => {
    const events = [
      tollCharge({ sourceType: 'trip', sourceId: 'trip-1' }),
      tollOffset({ sourceType: 'trip', sourceId: 'trip-1', metadata: { reason: 'cash_wash' } }),
    ];
    const pnl = buildPnLFromCanonicalEvents(events, period);
    const tolls = pnl.lines.find((l) => l.id === 'tolls')!;
    expect(tolls.amount).toBe(-0);
    expect(pnl.tollsRecoveredWashed).toBe(100);
    expect(pnl.lines.find((l) => l.id === 'tolls_memo')).toBeUndefined();
    expect(pnl.tollBreakdown).toEqual({
      grossCharges: 100,
      alreadyCovered: 100,
      chargedToDrivers: 0,
      fleetLoss: 0,
    });
  });

  it('nets a phantom offset to $0', () => {
    const events = [
      tollCharge({ sourceType: 'trip', sourceId: 'trip-2' }),
      tollOffset({ sourceType: 'trip', sourceId: 'trip-2', metadata: { reason: 'phantom' } }),
    ];
    const pnl = buildPnLFromCanonicalEvents(events, period);
    const tolls = pnl.lines.find((l) => l.id === 'tolls')!;
    expect(tolls.amount).toBe(-0);
  });

  it('counts an expense_logged toll exactly once when the original trip charge is offset', () => {
    const events = [
      // Original Uber-import trip-level toll_charge.
      tollCharge({ id: 'trip-ev', sourceType: 'trip', sourceId: 'trip-3', netAmount: 80, grossAmount: 80 }),
      // Offset neutralizing that original trip-level event.
      tollOffset({
        id: 'offset-ev',
        sourceType: 'trip',
        sourceId: 'trip-3',
        netAmount: 80,
        grossAmount: 80,
        metadata: { reason: 'superseded_by_expense_logged' },
      }),
      // The real cash toll_ledger row created by expense_logged — the sole survivor.
      tollCharge({ id: 'ledger-ev', sourceType: 'toll_ledger', sourceId: 'toll-9', netAmount: 80, grossAmount: 80 }),
    ];
    const pnl = buildPnLFromCanonicalEvents(events, period);
    const tolls = pnl.lines.find((l) => l.id === 'tolls')!;
    expect(tolls.amount).toBe(-80);
  });

  it('reinstates a previously offset charge (offset + later reinstatement nets back to full)', () => {
    const events = [
      tollCharge({ sourceType: 'trip', sourceId: 'trip-4', netAmount: 60, grossAmount: 60 }),
      tollOffset({ sourceType: 'trip', sourceId: 'trip-4', netAmount: 60, grossAmount: 60, direction: 'inflow' }),
      tollOffset({
        id: 'reinstate-ev',
        sourceType: 'trip',
        sourceId: 'trip-4',
        netAmount: 60,
        grossAmount: 60,
        direction: 'outflow',
      }),
    ];
    const pnl = buildPnLFromCanonicalEvents(events, period);
    const tolls = pnl.lines.find((l) => l.id === 'tolls')!;
    expect(tolls.amount).toBe(-60);
  });

  it('nets a real toll_refund against the gross charge', () => {
    const events = [
      tollCharge({ netAmount: 200, grossAmount: 200 }),
      {
        id: 'refund-ev',
        eventType: 'toll_refund',
        date: '2026-07-03',
        driverId: 'd1',
        sourceType: 'toll_ledger',
        sourceId: 'toll-1',
        netAmount: 50,
        grossAmount: 50,
        direction: 'inflow',
        platform: 'Roam',
      },
    ];
    const pnl = buildPnLFromCanonicalEvents(events, period);
    const tolls = pnl.lines.find((l) => l.id === 'tolls')!;
    expect(tolls.amount).toBe(-150);
  });

  it('floors negative netting at $0 and surfaces a coverage note', () => {
    const events = [
      tollCharge({ netAmount: 50, grossAmount: 50 }),
      tollOffset({ netAmount: 999, grossAmount: 999, direction: 'inflow' }),
    ];
    const pnl = buildPnLFromCanonicalEvents(events, period);
    const tolls = pnl.lines.find((l) => l.id === 'tolls')!;
    expect(tolls.amount).toBe(-0);
    expect(pnl.coverageNote).toMatch(/floored at \$0/);
  });

  it('never counts toll_charged_to_driver / toll_charge_reversed as Tolls (regression lock)', () => {
    const events = [
      tollCharge({ netAmount: 40, grossAmount: 40 }),
      {
        id: 'driver-charge',
        eventType: 'toll_charged_to_driver',
        date: '2026-07-02',
        driverId: 'd1',
        sourceType: 'toll_resolution',
        sourceId: 'toll-1',
        netAmount: -40,
        grossAmount: 40,
        direction: 'outflow',
        platform: 'Roam',
      },
      {
        id: 'driver-reversal',
        eventType: 'toll_charge_reversed',
        date: '2026-07-02',
        driverId: 'd1',
        sourceType: 'toll_resolution',
        sourceId: 'toll-1',
        netAmount: 40,
        grossAmount: 40,
        direction: 'inflow',
        platform: 'Roam',
      },
    ];
    const pnl = buildPnLFromCanonicalEvents(events, period);
    const tolls = pnl.lines.find((l) => l.id === 'tolls')!;
    expect(tolls.amount).toBe(-40);
    expect(pnl.tollBreakdown?.chargedToDrivers).toBe(0);
    expect(pnl.tollBreakdown?.fleetLoss).toBe(40);
  });

  it('shows Charge Driver amounts on the Tolls accordion breakdown only', () => {
    const events = [
      tollCharge({ netAmount: 100, grossAmount: 100 }),
      {
        id: 'driver-charge',
        eventType: 'toll_charged_to_driver',
        date: '2026-07-02',
        driverId: 'd1',
        sourceType: 'toll_resolution',
        sourceId: 'toll-1',
        netAmount: 60,
        grossAmount: 60,
        direction: 'outflow',
        platform: 'Roam',
      },
    ];
    const pnl = buildPnLFromCanonicalEvents(events, period);
    expect(pnl.lines.find((l) => l.id === 'tolls')!.amount).toBe(-100);
    expect(pnl.tollBreakdown).toEqual({
      grossCharges: 100,
      alreadyCovered: 0,
      chargedToDrivers: 60,
      fleetLoss: 100,
    });
  });

  it('flags pending (unresolved) trip-level tolls as provisional', () => {
    const events = [tollCharge({ sourceType: 'trip', sourceId: 'trip-5', netAmount: 30, grossAmount: 30 })];
    const pnl = buildPnLFromCanonicalEvents(events, period);
    expect(pnl.coverageNote).toMatch(/no cash-wash\/phantom\/personal determination synced/);
  });
});

describe('sumExpenseRowsFromEvents — Toll rows tie out to the P&L summary', () => {
  it('sums Toll category rows to the same total as buildPnLFromCanonicalEvents', () => {
    const events = [
      tollCharge({ id: 'a', sourceType: 'trip', sourceId: 'trip-6', netAmount: 120, grossAmount: 120 }),
      tollOffset({ id: 'b', sourceType: 'trip', sourceId: 'trip-6', netAmount: 120, grossAmount: 120, direction: 'inflow' }),
      tollCharge({ id: 'c', sourceType: 'toll_ledger', sourceId: 'toll-2', netAmount: 45, grossAmount: 45 }),
    ];
    const pnl = buildPnLFromCanonicalEvents(events, period);
    const agg = sumExpenseRowsFromEvents(events, period);
    const tollRowsTotal = agg.rows.filter((r) => r.category === 'Toll').reduce((s, r) => s + r.amount, 0);

    const summaryTolls = -(pnl.lines.find((l) => l.id === 'tolls')!.amount ?? 0);
    expect(Math.round(tollRowsTotal * 100) / 100).toBe(Math.round(summaryTolls * 100) / 100);
    expect(agg.tolls).toBe(summaryTolls);
  });

  it('renders toll_refund and toll_charge_offset (inflow) rows as negative-amount credits', () => {
    const events = [
      tollCharge({ netAmount: 100, grossAmount: 100 }),
      tollOffset({ id: 'offset-row', netAmount: 100, grossAmount: 100, direction: 'inflow' }),
    ];
    const agg = sumExpenseRowsFromEvents(events, period);
    const offsetRow = agg.rows.find((r) => r.id === 'offset-row')!;
    expect(offsetRow.amount).toBe(-100);
    expect(agg.tolls).toBe(0);
  });
});

function fuelExpense(overrides: Record<string, unknown> = {}) {
  return {
    id: overrides.id || 'fe1',
    eventType: 'fuel_expense',
    date: '2026-07-02',
    driverId: 'd1',
    sourceType: 'transaction',
    sourceId: 'entry-1',
    netAmount: 1000,
    grossAmount: 1000,
    direction: 'outflow',
    platform: 'Roam',
    ...overrides,
  };
}

function fuelOffset(overrides: Record<string, unknown> = {}) {
  return {
    id: overrides.id || 'fe-offset',
    eventType: 'fuel_charge_offset',
    date: '2026-07-02',
    driverId: 'd1',
    sourceType: 'transaction',
    sourceId: 'entry-1',
    netAmount: 300,
    grossAmount: 300,
    direction: 'inflow',
    platform: 'Roam',
    ...overrides,
  };
}

describe('buildPnLFromCanonicalEvents — fuel netting', () => {
  it('counts plain fuel_expense in full before Finalize offsets', () => {
    const pnl = buildPnLFromCanonicalEvents([fuelExpense()], period);
    expect(pnl.lines.find((l) => l.id === 'fuel')!.amount).toBe(-1000);
    expect(pnl.fuelRecoveredWashed).toBeUndefined();
  });

  it('nets driver-share offset off the Fuel line', () => {
    const events = [fuelExpense(), fuelOffset()];
    const pnl = buildPnLFromCanonicalEvents(events, period);
    expect(pnl.lines.find((l) => l.id === 'fuel')!.amount).toBe(-700);
    expect(pnl.fuelRecoveredWashed).toBe(300);
    expect(pnl.fuelBreakdown).toEqual({
      grossSpend: 1000,
      alreadyCovered: 300,
      reimbursedToDrivers: 0,
      fleetLoss: 700,
    });
  });

  it('fully offset fuel nets to $0 but keeps event count for fallback', () => {
    const events = [fuelExpense(), fuelOffset({ netAmount: 1000, grossAmount: 1000 })];
    const pnl = buildPnLFromCanonicalEvents(events, period);
    expect(pnl.lines.find((l) => l.id === 'fuel')!.amount).toBe(-0);
    const agg = sumExpenseRowsFromEvents(events, period);
    expect(agg.fuelEventCount).toBeGreaterThan(0);
    expect(agg.fuel).toBe(0);
  });

  it('shows fuel_reimbursement in breakdown but does not net it into fleet loss', () => {
    const events = [
      fuelExpense(),
      {
        id: 'reimb',
        eventType: 'fuel_reimbursement',
        date: '2026-07-02',
        netAmount: 200,
        direction: 'inflow',
        platform: 'Roam',
      },
    ];
    const pnl = buildPnLFromCanonicalEvents(events, period);
    expect(pnl.lines.find((l) => l.id === 'fuel')!.amount).toBe(-1000);
    expect(pnl.fuelBreakdown?.reimbursedToDrivers).toBe(200);
  });
});
