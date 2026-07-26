import { describe, it, expect } from 'vitest';
import { matchJaaStatementToDriverLogs, applyFuelMatchLinks } from './jaaFuelStatementMatcher';
import type { FuelEntry } from '../types/fuel';

function entry(partial: Partial<FuelEntry>): FuelEntry {
  return {
    id: partial.id || crypto.randomUUID(),
    date: partial.date || '2025-03-27',
    amount: partial.amount ?? 6726.8,
    liters: partial.liters ?? 36.2,
    pricePerLiter: partial.pricePerLiter,
    vehicleId: partial.vehicleId,
    type: partial.type || 'Card_Transaction',
    entryMode: partial.entryMode || 'Floating',
    paymentSource: partial.paymentSource || 'Gas_Card',
    entrySource: partial.entrySource,
    metadata: partial.metadata,
    odometer: partial.odometer ?? null,
  };
}

describe('matchJaaStatementToDriverLogs', () => {
  it('matches statement to driver log on vehicle+date+amount+liters', () => {
    const statement = entry({
      id: 'stmt-1',
      entrySource: 'fuel-card',
      vehicleId: 'veh-a',
      metadata: { importSource: 'jaa_statement_details', jaaReceiptNumber: 'ZZ1' },
    });
    const driver = entry({
      id: 'drv-1',
      entrySource: 'driver-portal',
      paymentSource: 'Gas_Card',
      vehicleId: 'veh-a',
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
});
