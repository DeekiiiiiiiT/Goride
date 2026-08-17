import { describe, it, expect } from 'vitest';
import {
  matchJaaStatementToDriverLogs,
  applyFuelMatchLinks,
  isJaaStatementLedgerRow,
  collectJaaStatementReceiptNumbers,
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

describe('collectJaaStatementReceiptNumbers', () => {
  it('includes statement receipts and ignores matched driver logs', () => {
    const statement = entry({
      entrySource: 'fuel-card',
      metadata: { importSource: 'jaa_raw', jaaReceiptNumber: 'ZZ0028966858' },
    });
    const driverMatched = entry({
      entrySource: 'driver-portal',
      paymentSource: 'Gas_Card',
      metadata: {
        jaaReceiptNumber: 'ZZ0028966858',
        jaaMatchedStatementId: 'old-stmt',
        source: 'Fuel Log',
      },
    });
    const otherStatement = entry({
      entrySource: 'fuel-card',
      metadata: { importSource: 'jaa_raw', jaaReceiptNumber: 'ZZOTHER' },
    });

    const set = collectJaaStatementReceiptNumbers([statement, driverMatched, otherStatement]);
    expect(set.has('ZZ0028966858')).toBe(true);
    expect(set.has('ZZOTHER')).toBe(true);
    expect(set.size).toBe(2);
  });

  it('returns empty when only driver logs carry receipts', () => {
    const driverOnly = entry({
      entrySource: 'driver-portal',
      metadata: { jaaReceiptNumber: 'ZZ0028966858' },
    });
    expect(collectJaaStatementReceiptNumbers([driverOnly]).size).toBe(0);
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

  it('does not treat statement/declined rows as driver logs (5179KZ Aug 11–14)', () => {
    const cardId = '0e012bd9-dffd-4638-82ea-41a2df2f0aad';
    const vehicleId = '5179KZ';
    const stmt = (id: string, date: string, time: string, kind: string, amount: number, liters: number | null) =>
      entry({
        id,
        date,
        time,
        amount,
        liters,
        cardId,
        vehicleId,
        entrySource: 'fuel-card',
        paymentSource: 'Gas_Card',
        metadata: { importSource: 'jaa_raw', jaaRowKind: kind },
      });
    const admin = (id: string, date: string, time: string) =>
      entry({
        id,
        date,
        time,
        amount: 0,
        liters: null,
        cardId,
        vehicleId,
        type: 'Manual_Entry',
        entryMode: 'Anchor',
        entrySource: 'admin-manual',
        paymentSource: 'Gas_Card',
        metadata: { awaitingCardStatement: true },
      });

    const statements = [
      stmt('s-14', '2026-08-14', '17:29:49', 'approved_fuel', 2950, 12.89),
      stmt('s-13', '2026-08-13', '17:36:36', 'approved_fuel', 6003.8, 25.22),
      stmt('s-11', '2026-08-11', '10:08:32', 'approved_fuel', 6045, 26.31),
      stmt('d-1105', '2026-08-11', '10:05:48', 'declined', 6045, null),
      stmt('d-1104', '2026-08-11', '10:04:04', 'declined', 6045, null),
    ];
    const logs = [
      admin('a-14', '2026-08-14', '17:29:00'),
      admin('a-13', '2026-08-13', '17:37:00'),
      admin('a-11', '2026-08-11', '10:10:00'),
    ];

    const { updates, summary } = buildJaaMatchUpdates(statements, [...statements, ...logs]);
    expect(summary.ambiguous).toBe(0);
    expect(summary.matched).toBe(3);
    expect(updates.find((u) => u.id === 'a-14')?.amount).toBe(2950);
    expect(updates.find((u) => u.id === 'a-13')?.liters).toBe(25.22);
    expect(updates.find((u) => u.id === 'a-11')?.amount).toBe(6045);
    expect(updates.find((u) => u.id === 'a-14')?.metadata?.awaitingCardStatement).toBe(false);
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
