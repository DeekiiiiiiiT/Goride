import { describe, it, expect } from 'vitest';
import {
  computeIndriveWalletFeesFromLedgerEntries,
  computeIndriveWalletLoadsFromLedgerEntries,
  buildIndriveWalletFleetFromLedger,
  isIndriveWalletShort,
} from './indriveWalletMetrics';

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

describe('computeIndriveWalletLoadsFromLedgerEntries', () => {
  const range = { start: '2025-01-01', end: '2025-01-31' };

  it('sums wallet_credit in period and lifetime', () => {
    const entries = [
      { eventType: 'wallet_credit', netAmount: 1000, date: '2025-01-10', driverId: 'd1' },
      { eventType: 'wallet_credit', netAmount: 500, date: '2024-12-01', driverId: 'd1' },
      { eventType: 'platform_fee', netAmount: -50, date: '2025-01-10', platform: 'InDrive' },
    ];
    const r = computeIndriveWalletLoadsFromLedgerEntries(entries, range.start, range.end);
    expect(r.periodLoads).toBe(1000);
    expect(r.lifetimeLoads).toBe(1500);
  });

  it('ignores non-wallet_credit event types', () => {
    const entries = [
      { eventType: 'fuel_expense', netAmount: 200, date: '2025-01-10' },
      { eventType: 'fare_earning', netAmount: 80, grossAmount: 100, date: '2025-01-10' },
    ];
    const r = computeIndriveWalletLoadsFromLedgerEntries(entries, range.start, range.end);
    expect(r.periodLoads).toBe(0);
    expect(r.lifetimeLoads).toBe(0);
  });
});

describe('buildIndriveWalletFleetFromLedger', () => {
  it('aggregates per driver with alias ids and short count', () => {
    const drivers = [
      { id: 'roam-1', inDriveDriverId: 'indrive-alias' },
      { id: 'roam-2' },
    ];
    const entries = [
      {
        eventType: 'wallet_credit',
        netAmount: 100,
        date: '2025-01-05',
        driverId: 'indrive-alias',
      },
      {
        eventType: 'platform_fee',
        platform: 'InDrive',
        netAmount: -250,
        date: '2025-01-06',
        driverId: 'roam-1',
      },
      {
        eventType: 'wallet_credit',
        netAmount: 500,
        date: '2025-01-08',
        driverId: 'roam-2',
      },
    ];
    const { drivers: rows, totals } = buildIndriveWalletFleetFromLedger(
      drivers,
      entries,
      '2025-01-01',
      '2025-01-31',
    );
    expect(rows).toHaveLength(2);
    const d1 = rows.find((r) => r.driverId === 'roam-1')!;
    expect(d1.lifetimeLoads).toBe(100);
    expect(d1.lifetimeInDriveFees).toBe(250);
    expect(d1.estimatedBalance).toBe(-150);
    expect(isIndriveWalletShort(d1.estimatedBalance)).toBe(true);
    expect(totals.shortDriverCount).toBe(1);
    expect(totals.periodLoads).toBe(600);
  });
});
