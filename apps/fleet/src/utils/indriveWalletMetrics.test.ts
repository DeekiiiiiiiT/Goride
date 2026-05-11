import { describe, it, expect } from 'vitest';
import { computeIndriveWalletFeesFromLedgerEntries } from './indriveWalletMetrics';

describe('computeIndriveWalletFeesFromLedgerEntries', () => {
  const range = { start: '2025-01-01', end: '2025-01-31' };

  it('uses platform_fee InDrive in period', () => {
    const entries = [
      {
        platform: 'InDrive',
        eventType: 'platform_fee',
        netAmount: -10,
        grossAmount: 0,
        date: '2025-01-15',
      },
      {
        platform: 'InDrive',
        eventType: 'platform_fee',
        netAmount: -5,
        grossAmount: 0,
        date: '2024-12-01',
      },
    ];
    const r = computeIndriveWalletFeesFromLedgerEntries(entries, range.start, range.end);
    expect(r.periodFees).toBe(10);
    expect(r.lifetimeInDriveFees).toBe(15);
  });

  it('falls back to fare_earning gross−net when no platform_fee', () => {
    const entries = [
      {
        platform: 'InDrive',
        eventType: 'fare_earning',
        netAmount: 80,
        grossAmount: 100,
        date: '2025-01-10',
      },
    ];
    const r = computeIndriveWalletFeesFromLedgerEntries(entries, range.start, range.end);
    expect(r.periodFees).toBe(20);
    expect(r.lifetimeInDriveFees).toBe(20);
  });

  it('ignores non-InDrive platforms', () => {
    const entries = [
      {
        platform: 'Uber',
        eventType: 'platform_fee',
        netAmount: -99,
        grossAmount: 0,
        date: '2025-01-10',
      },
    ];
    const r = computeIndriveWalletFeesFromLedgerEntries(entries, range.start, range.end);
    expect(r.periodFees).toBe(0);
    expect(r.lifetimeInDriveFees).toBe(0);
  });
});
