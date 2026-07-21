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

  it('treats terminal workflow stages as handled (Settlement vs Completed alignment)', () => {
    for (const workflowStage of [
      'matched',
      'claim_filed',
      'claim_resolved',
      'personal_use_resolved',
      'deadhead_resolved',
    ]) {
      expect(
        deriveTollTxIsReconciled({
          isReconciled: false,
          status: 'pending',
          tripId: null,
          workflowStage,
        }),
      ).toBe(true);
    }
  });

  it('keeps pending workflow stages unmatched when ledger flag is false', () => {
    expect(
      deriveTollTxIsReconciled({
        isReconciled: false,
        status: 'pending',
        tripId: null,
        workflowStage: 'needs_review',
      }),
    ).toBe(false);
  });
});

describe('top-level resolution + classifyTollLedgerEntry', () => {
  // Cash plaza spend always washes; personal liability is the Charge Driver
  // wallet debit — counting cash as personal would double-count.
  it('keeps cash plaza spend as cashWash even when resolution is personal', () => {
    expect(
      classifyTollLedgerEntry({
        paymentMethod: 'Cash',
        resolution: 'personal',
        isReconciled: true,
        tripId: null,
        amount: -285,
      }),
    ).toBe('cashWash');
  });
});
