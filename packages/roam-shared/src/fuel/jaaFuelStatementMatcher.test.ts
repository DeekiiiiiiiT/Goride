import { describe, it, expect } from 'vitest';
import {
  matchJaaStatementToDriverLogs,
  applyFuelMatchLinks,
  isJaaStatementLedgerRow,
  buildJaaMatchUpdates,
  hydrateStatementsFromCards,
  type FuelEntryLike,
} from './jaaFuelStatementMatcher';

function entry(partial: Partial<FuelEntryLike>): FuelEntryLike {
  return {
    id: partial.id || crypto.randomUUID(),
    date: partial.date || '2025-03-27',
    amount: partial.amount ?? 6726.8,
    liters: partial.liters ?? 36.2,
    pricePerLiter: partial.pricePerLiter,
    location: partial.location,
    vehicleId: partial.vehicleId,
    cardId: partial.cardId,
    type: partial.type || 'Card_Transaction',
    entryMode: partial.entryMode || 'Floating',
    paymentSource: partial.paymentSource || 'Gas_Card',
    entrySource: partial.entrySource,
    metadata: partial.metadata,
    odometer: partial.odometer ?? null,
    time: partial.time,
  };
}

describe('isJaaStatementLedgerRow', () => {
  it('detects jaa_raw import source', () => {
    expect(
      isJaaStatementLedgerRow(entry({ metadata: { importSource: 'jaa_raw' }, entrySource: 'fuel-card' })),
    ).toBe(true);
  });

  it('does not flag driver portal logs', () => {
    expect(
      isJaaStatementLedgerRow(
        entry({ entrySource: 'driver-portal', paymentSource: 'Gas_Card', metadata: {} }),
      ),
    ).toBe(false);
  });
});

describe('matchJaaStatementToDriverLogs', () => {
  it('matches statement to driver log on card+vehicle+date', () => {
    const statement = entry({
      id: 'stmt-1',
      entrySource: 'fuel-card',
      vehicleId: 'veh-a',
      cardId: 'card-1',
      metadata: { importSource: 'jaa_statement_details', jaaReceiptNumber: 'ZZ1' },
    });
    const driver = entry({
      id: 'drv-1',
      entrySource: 'driver-portal',
      paymentSource: 'Gas_Card',
      vehicleId: 'veh-a',
      cardId: 'card-1',
      pricePerLiter: 185.82,
    });
    const pairs = matchJaaStatementToDriverLogs([statement], [driver]);
    const matched = pairs.filter((p) => p.status === 'matched');
    expect(matched.length).toBe(1);
    expect(matched[0].driverEntry?.id).toBe('drv-1');

    const linked = applyFuelMatchLinks(matched[0]);
    expect(linked.driver?.metadata?.jaaMatchedStatementId).toBe('stmt-1');
    expect(linked.statement?.metadata?.jaaMatchedDriverEntryId).toBe('drv-1');
  });

  it('never matches fee or declined rows', () => {
    const fee = entry({
      id: 'fee-1',
      cardId: 'card-1',
      metadata: { importSource: 'jaa_raw', jaaRowKind: 'fee' },
      entrySource: 'fuel-card',
    });
    const driver = entry({
      id: 'drv-1',
      cardId: 'card-1',
      entrySource: 'driver-portal',
      paymentSource: 'Gas_Card',
    });
    const pairs = matchJaaStatementToDriverLogs([fee], [driver]);
    expect(pairs.filter((p) => p.status === 'matched')).toHaveLength(0);
  });

  it('skips ambiguous close scores', () => {
    const statement = entry({
      id: 'stmt-1',
      cardId: 'card-1',
      vehicleId: 'veh-a',
      date: '2025-03-27',
      entrySource: 'fuel-card',
      metadata: { importSource: 'jaa_raw', jaaRowKind: 'approved_fuel' },
    });
    const d1 = entry({
      id: 'drv-1',
      cardId: 'card-1',
      vehicleId: 'veh-a',
      date: '2025-03-27',
      entrySource: 'driver-portal',
      paymentSource: 'Gas_Card',
    });
    const d2 = entry({
      id: 'drv-2',
      cardId: 'card-1',
      vehicleId: 'veh-a',
      date: '2025-03-27',
      entrySource: 'driver-portal',
      paymentSource: 'Gas_Card',
    });
    const pairs = matchJaaStatementToDriverLogs([statement], [d1, d2]);
    expect(pairs.some((p) => p.status === 'ambiguous')).toBe(true);
    expect(buildJaaMatchUpdates([statement], [d1, d2, statement]).updates).toHaveLength(0);
  });

  it('prefer driver station and clears awaitingCardStatement on enrich', () => {
    const statement = entry({
      id: 'stmt-1',
      amount: 100,
      liters: 10,
      location: 'JAA SUPER LUBE',
      cardId: 'card-1',
      vehicleId: 'veh-a',
      entrySource: 'fuel-card',
      metadata: {
        importSource: 'jaa_raw',
        jaaRowKind: 'approved_fuel',
        jaaReceiptNumber: 'R1',
      },
    });
    const driver = entry({
      id: 'drv-1',
      amount: 0,
      liters: null,
      location: 'Roam Verified Station',
      cardId: 'card-1',
      vehicleId: 'veh-a',
      entrySource: 'driver-portal',
      paymentSource: 'Gas_Card',
      entryMode: 'Anchor',
      metadata: { awaitingCardStatement: true },
    });
    const linked = applyFuelMatchLinks({
      status: 'matched',
      statementEntry: statement,
      driverEntry: driver,
      score: 90,
    });
    expect(linked.driver?.location).toBe('Roam Verified Station');
    expect(linked.driver?.amount).toBe(100);
    expect(linked.driver?.liters).toBe(10);
    expect(linked.driver?.metadata?.awaitingCardStatement).toBe(false);
    expect(linked.driver?.metadata?.jaaReceiptNumber).toBe('R1');
  });

  it('matches legacy pump log via card assigned vehicle when driver has no cardId', () => {
    const statement = entry({
      id: 'stmt-1',
      amount: 4500,
      liters: 19.57,
      cardId: 'card-1',
      date: '2026-08-05',
      time: '20:24:00',
      entrySource: 'fuel-card',
      metadata: { importSource: 'jaa_raw', jaaRowKind: 'approved_fuel', jaaReceiptNumber: 'R1' },
    });
    const driver = entry({
      id: 'drv-1',
      amount: 4500,
      liters: 19.56,
      cardId: undefined,
      vehicleId: '5179KZ',
      date: '2026-08-05T20:25:00',
      entrySource: 'driver-portal',
      paymentSource: 'Gas_Card',
      location: 'Jampet Service Station',
    });
    const cards = [{ id: 'card-1', assignedVehicleId: '5179KZ' }];
    const { updates, summary } = buildJaaMatchUpdates([statement], [driver, statement], cards);
    expect(summary.matched).toBe(1);
    expect(updates.some((u) => u.id === 'drv-1' && u.metadata?.jaaMatchedStatementId === 'stmt-1')).toBe(
      true,
    );
    expect(updates.some((u) => u.id === 'stmt-1' && u.metadata?.jaaMatchedDriverEntryId === 'drv-1')).toBe(
      true,
    );
  });
});

describe('hydrateStatementsFromCards', () => {
  it('attributes blank driver from card history at statement time after handoff', () => {
    const statements = [
      entry({
        id: 's-mon',
        date: '2026-07-02',
        time: '12:00:00',
        cardId: 'card-1',
        driverId: undefined,
        entrySource: 'fuel-card',
        metadata: { importSource: 'jaa_raw' },
      }),
      entry({
        id: 's-fri',
        date: '2026-07-05',
        time: '12:00:00',
        cardId: 'card-1',
        driverId: undefined,
        entrySource: 'fuel-card',
        metadata: { importSource: 'jaa_raw' },
      }),
    ];
    const cards = [
      {
        id: 'card-1',
        assignedDriverId: 'b',
        assignedVehicleId: 'v1',
        assignmentHistory: [
          {
            driverId: 'a',
            assignedAt: '2026-07-01T00:00:00.000Z',
            unassignedAt: '2026-07-04T00:00:00.000Z',
          },
          { driverId: 'b', assignedAt: '2026-07-04T00:00:00.000Z' },
        ],
      },
    ];
    const hydrated = hydrateStatementsFromCards(statements, cards);
    expect(hydrated.find((s) => s.id === 's-mon')?.driverId).toBe('a');
    expect(hydrated.find((s) => s.id === 's-fri')?.driverId).toBe('b');
  });
});
