import { describe, expect, it } from 'vitest';
import {
  buildTollContentFingerprint,
  findDuplicateTollLedgerEntry,
  fingerprintFromTollLike,
} from './tollLedgerIntegrity';

describe('tollImportDedup', () => {
  it('blocks second insert when content fingerprint matches (no ref)', () => {
    const fp = buildTollContentFingerprint({
      vehicleId: 'veh-a',
      date: '2026-07-01',
      amount: -780,
      metadata: { laneId: 'E02', collector: '7' },
    });
    const existing = [
      {
        id: 'first',
        vehicleId: 'veh-a',
        date: '2026-07-01',
        amount: -780,
        metadata: { lane: 'E02', collector: '7', contentFingerprint: fp },
      },
    ];
    const candidate = {
      id: 'second',
      vehicleId: 'veh-a',
      date: '2026-07-01',
      amount: -780,
      metadata: { laneId: 'E02', collector: '7' },
    };
    const dup = findDuplicateTollLedgerEntry(candidate, existing);
    expect(dup?.reason).toBe('content_fingerprint');
    expect(dup?.existingId).toBe('first');
  });

  it('does not match different reference numbers on same day/amount', () => {
    const existing = [
      {
        id: 'a',
        date: '2026-08-17',
        amount: -850,
        referenceNumber: '00700049',
        vehicleId: 'v1',
      },
    ];
    const candidate = {
      id: 'b',
      date: '2026-08-17',
      amount: -850,
      referenceNumber: '00700050',
      vehicleId: 'v1',
    };
    expect(findDuplicateTollLedgerEntry(candidate, existing)).toBeNull();
  });

  it('fingerprintFromTollLike uses stored fingerprint when present', () => {
    const row = {
      vehicleId: 'v1',
      date: '2026-08-17',
      amount: -850,
      metadata: { contentFingerprint: 'custom-fp' },
    };
    expect(fingerprintFromTollLike(row)).toBe('custom-fp');
  });
});
