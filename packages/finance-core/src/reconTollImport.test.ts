import { describe, expect, it } from 'vitest';
import {
  classifyTollImportRow,
  findDuplicateTollByReferenceOnly,
} from './reconTollImport.ts';

describe('classifyTollImportRow — P2 toll staged import', () => {
  const existing = [
    {
      id: 'ledger-1',
      date: '2026-08-17',
      amount: -850,
      vehicleId: 'v1',
      referenceNumber: 'TXN-A',
      metadata: { laneId: 'W03', collector: '12' },
      status: 'pending',
    },
  ];

  it('classifies same provider ref as duplicate_ref', () => {
    const r = classifyTollImportRow(
      {
        id: 'new-1',
        date: '2026-08-17',
        amount: -850,
        vehicleId: 'v1',
        referenceNumber: 'TXN-A',
      },
      existing,
    );
    expect(r.classification).toBe('duplicate_ref');
  });

  it('different Txn ID + same fingerprint → duplicate_fingerprint not duplicate_ref', () => {
    const r = classifyTollImportRow(
      {
        id: 'new-2',
        date: '2026-08-17',
        amount: -850,
        vehicleId: 'v1',
        referenceNumber: 'TXN-B',
        metadata: { laneId: 'W03', collector: '12' },
      },
      existing,
    );
    expect(r.classification).toBe('duplicate_fingerprint');
    expect(r.classification).not.toBe('duplicate_ref');
    expect(r.reason).toBe('fingerprint_match_different_ref');
  });

  it('override path: ref-only dedupe allows fingerprint duplicate when refs differ', () => {
    const candidate = {
      id: 'new-3',
      date: '2026-08-17',
      amount: -850,
      vehicleId: 'v1',
      referenceNumber: 'TXN-C',
      metadata: { laneId: 'W03', collector: '12' },
    };
    expect(findDuplicateTollByReferenceOnly(candidate, existing)).toBeNull();
  });
});
