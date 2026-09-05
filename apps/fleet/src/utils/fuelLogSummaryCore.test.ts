/**
 * Contract: client buildTransactionKpis ≡ summarizeFuelLogEntries (server mirror).
 * Edge copy: supabase/functions/_fleet-server/fuel_log_summary.ts — keep in sync.
 */
import { describe, expect, it } from 'vitest';
import type { FuelEntry } from '../types/fuel';
import { buildTransactionKpis } from './fuelLogKpiMetrics';
import { summarizeFuelLogEntries } from './fuelLogSummaryCore';

function makeEntry(partial: Partial<FuelEntry> & { id: string }): FuelEntry {
  return {
    date: '2026-08-24',
    amount: 100,
    liters: 10,
    type: 'Manual_Entry',
    entryMode: 'Floating',
    paymentSource: 'RideShare_Cash',
    ...partial,
  } as FuelEntry;
}

/** Shared fixture — same shape the edge summarizer must accept. */
const FIXTURE: FuelEntry[] = [
  makeEntry({
    id: 'f1',
    vehicleId: 'v1',
    date: '2026-08-20',
    amount: 100,
    liters: 10,
    odometer: 1000,
    entrySource: 'driver-portal',
  }),
  makeEntry({
    id: 'f2',
    vehicleId: 'v1',
    date: '2026-08-21',
    amount: 50,
    liters: 5,
    odometer: 1100,
    type: 'Fuel_Manual_Entry',
    metadata: { source: 'Fuel Log' },
  }),
  makeEntry({
    id: 'fee',
    vehicleId: 'v1',
    date: '2026-08-21',
    amount: 5,
    liters: 0,
    metadata: { jaaRowKind: 'fee', importSource: 'jaa_raw' },
  }),
  makeEntry({
    id: 'await',
    vehicleId: 'v1',
    date: '2026-08-22',
    amount: 0,
    liters: 0,
    odometer: 1200,
    paymentSource: 'Gas_Card',
    type: 'Card_Transaction',
    metadata: { awaitingCardStatement: true },
  }),
  makeEntry({
    id: 'anchor',
    vehicleId: 'v1',
    date: '2026-08-23',
    amount: 80,
    liters: 8,
    odometer: 1300,
    entryMode: 'Anchor',
    entrySource: 'admin-manual',
  }),
];

describe('fuel log summary contract (client ≡ server core)', () => {
  it('buildTransactionKpis matches summarizeFuelLogEntries on shared fields', () => {
    const client = buildTransactionKpis(FIXTURE);
    const core = summarizeFuelLogEntries(FIXTURE);

    expect(client.totalFills).toBe(core.totalFills);
    expect(client.totalSpend).toBe(core.totalSpend);
    expect(client.totalVolume).toBe(core.totalVolume);
    expect(client.totalKm).toBe(core.totalKm);
    expect(client.sourcePortal).toBe(core.sourcePortal);
    expect(client.sourceAdmin).toBe(core.sourceAdmin);
    expect(client.sourceAnchors).toBe(core.sourceAnchors);
  });

  it('excludes JAA fee from fills and excludes awaiting from spend', () => {
    const core = summarizeFuelLogEntries(FIXTURE);
    // fee excluded from fills; awaiting still a fill but not spend
    expect(core.totalFills).toBe(4);
    expect(core.totalSpend).toBe(230); // 100+50+80 — not fee, not awaiting $0
    expect(core.totalVolume).toBe(23);
    expect(core.totalKm).toBe(300); // 100+100+100
    expect(core.sourceAnchors).toBe(1);
  });

  it('never uses cycle-distance semantics for totalKm', () => {
    const core = summarizeFuelLogEntries(FIXTURE);
    // Fill-to-fill only — not a fabricated cycle sum
    expect(core.totalKm).toBe(300);
  });
});
