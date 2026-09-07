import { describe, expect, it } from 'vitest';
import { enterpriseFuelSyncIdempotencyKey, fuelSettlementEntryYmd } from './settlementShared.ts';

describe('fuelSettlementEntryYmd — fleet-tz calendar day', () => {
  it('passes a bare yyyy-MM-dd straight through', () => {
    expect(fuelSettlementEntryYmd('2026-08-31')).toBe('2026-08-31');
  });

  it('keeps a late-UTC timestamp on the correct Jamaica settlement day', () => {
    // 11:30pm UTC Aug 31 = 6:30pm Jamaica Aug 31 — must NOT roll to Sep 1.
    expect(fuelSettlementEntryYmd('2026-08-31T23:30:00.000Z')).toBe('2026-08-31');
  });

  it('handles space-separated datetimes by day', () => {
    expect(fuelSettlementEntryYmd('2026-08-31 14:00:00')).toBe('2026-08-31');
  });

  it('returns empty string for empty / non-string input', () => {
    expect(fuelSettlementEntryYmd('')).toBe('');
    expect(fuelSettlementEntryYmd(null)).toBe('');
    expect(fuelSettlementEntryYmd(undefined)).toBe('');
  });
});

describe('enterpriseFuelSyncIdempotencyKey — unchanged formula', () => {
  it('builds a stable versioned key', () => {
    expect(enterpriseFuelSyncIdempotencyKey('r1', 'e1', 'credit')).toBe(
      'enterprise_fuel_sync:r1:e1:credit:v1',
    );
  });
});
