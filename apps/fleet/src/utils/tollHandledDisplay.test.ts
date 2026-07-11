import { describe, it, expect } from 'vitest';
import { deriveTollTxIsReconciled } from './tollHandledDisplay';
import { classifyTollLedgerEntry } from './tollDisposition';

describe('deriveTollTxIsReconciled', () => {
  it('honors ledger isReconciled even when status is rejected and tripId is null', () => {
    expect(
      deriveTollTxIsReconciled({
        isReconciled: true,
        status: 'rejected',
        resolution: null,
        tripId: null,
      }),
    ).toBe(true);
  });

  it('honors ledger isReconciled for claim_filed / pending status', () => {
    expect(
      deriveTollTxIsReconciled({
        isReconciled: true,
        status: 'pending',
        resolution: null,
        tripId: null,
      }),
    ).toBe(true);
  });

  it('treats terminal resolution as handled without ledger flag', () => {
    expect(
      deriveTollTxIsReconciled({
        isReconciled: false,
        status: 'pending',
        resolution: 'personal',
        tripId: null,
      }),
    ).toBe(true);
  });

  it('treats trip link as handled', () => {
    expect(
      deriveTollTxIsReconciled({
        isReconciled: false,
        status: 'pending',
        tripId: 'trip-1',
      }),
    ).toBe(true);
  });

  it('leaves unfinished underpaid tolls unmatched', () => {
    expect(
      deriveTollTxIsReconciled({
        isReconciled: false,
        status: 'pending',
        resolution: null,
        tripId: null,
      }),
    ).toBe(false);
  });
});

describe('top-level resolution + classifyTollLedgerEntry', () => {
  it('classifies personal cash toll as personal (not cashWash) when resolution is top-level', () => {
    expect(
      classifyTollLedgerEntry({
        paymentMethod: 'Cash',
        resolution: 'personal',
        isReconciled: true,
        tripId: null,
        amount: -285,
      }),
    ).toBe('personal');
  });
});
