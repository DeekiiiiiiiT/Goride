import { describe, it, expect } from 'vitest';
import {
  matchJaaStatementToDriverLogs,
  applyFuelMatchLinks,
  isJaaStatementLedgerRow,
  collectJaaStatementReceiptNumbers,
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
  };
}

describe('jaaFuelStatementMatcher (fleet re-export)', () => {
  it('matches and prefers driver station on enrich', () => {
    const statement = entry({
      id: 'stmt-1',
      entrySource: 'fuel-card',
      vehicleId: 'veh-a',
      cardId: 'card-1',
      location: 'JAA SITE',
      metadata: { importSource: 'jaa_statement_details', jaaReceiptNumber: 'ZZ1' },
    });
    const driver = entry({
      id: 'drv-1',
      entrySource: 'driver-portal',
      paymentSource: 'Gas_Card',
      vehicleId: 'veh-a',
      cardId: 'card-1',
      location: 'Roam Station',
      pricePerLiter: 185.82,
    });
    const pairs = matchJaaStatementToDriverLogs([statement], [driver]);
    const matched = pairs.filter((p) => p.status === 'matched');
    expect(matched.length).toBe(1);
    const linked = applyFuelMatchLinks(matched[0]);
    expect(linked.driver?.location).toBe('Roam Station');
    expect(linked.driver?.metadata?.jaaMatchedStatementId).toBe('stmt-1');
  });

  it('isJaaStatementLedgerRow flags jaa_raw', () => {
    expect(isJaaStatementLedgerRow(entry({ metadata: { importSource: 'jaa_raw' } }))).toBe(true);
  });

  it('collectJaaStatementReceiptNumbers ignores driver-only receipts', () => {
    const set = collectJaaStatementReceiptNumbers([
      entry({
        entrySource: 'driver-portal',
        metadata: { jaaReceiptNumber: 'ZZ0028966858' },
      }),
      entry({
        entrySource: 'fuel-card',
        metadata: { importSource: 'jaa_raw', jaaReceiptNumber: 'FEE1' },
      }),
    ]);
    expect(set.has('ZZ0028966858')).toBe(false);
    expect(set.has('FEE1')).toBe(true);
  });
});
