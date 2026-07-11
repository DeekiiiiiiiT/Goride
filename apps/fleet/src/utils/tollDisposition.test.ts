import { describe, it, expect } from 'vitest';
import { classifyTollLedgerEntry, addToTollDisposition, emptyTollDisposition, isCashPaidToll } from './tollDisposition';

/**
 * The locked toll-responsibility policy, as a matrix. This is the money-critical
 * rule that drives every driver financial tab, so each case is pinned.
 */
describe('classifyTollLedgerEntry — policy matrix', () => {
  it('cash toll (driver paid company cash) → cashWash', () => {
    expect(classifyTollLedgerEntry({ paymentMethod: 'cash' })).toBe('cashWash');
    expect(classifyTollLedgerEntry({ paymentMethod: 'tag_balance', receiptUrl: 'r.jpg' })).toBe('cashWash');
  });

  it('tag toll resolved Personal → personal (billed to driver)', () => {
    expect(classifyTollLedgerEntry({ paymentMethod: 'tag_balance', resolution: 'personal' })).toBe('personal');
    // resolution wins even for a cash payment method
    expect(classifyTollLedgerEntry({ paymentMethod: 'cash', resolution: 'personal' })).toBe('personal');
  });

  it('business / write_off / refunded → fleet (no driver effect)', () => {
    expect(classifyTollLedgerEntry({ paymentMethod: 'tag_balance', resolution: 'business' })).toBe('fleet');
    expect(classifyTollLedgerEntry({ paymentMethod: 'tag_balance', resolution: 'write_off' })).toBe('fleet');
    expect(classifyTollLedgerEntry({ paymentMethod: 'tag_balance', resolution: 'refunded' })).toBe('fleet');
  });

  it('tag toll matched to a trip (platform reimbursed) → fleet', () => {
    expect(classifyTollLedgerEntry({ paymentMethod: 'tag_balance', tripId: 'trip1' })).toBe('fleet');
    expect(classifyTollLedgerEntry({ paymentMethod: 'fleet_account', isReconciled: true })).toBe('fleet');
  });

  it('tag toll with no resolution and no trip → unresolved', () => {
    expect(classifyTollLedgerEntry({ paymentMethod: 'tag_balance' })).toBe('unresolved');
    expect(classifyTollLedgerEntry({ paymentMethod: 'fleet_account' })).toBe('unresolved');
  });
});

describe('isCashPaidToll — payment source (Cash vs Tag column)', () => {
  it('treats cash and receipt tolls as cash regardless of personal resolution', () => {
    expect(isCashPaidToll({ paymentMethod: 'cash' })).toBe(true);
    expect(isCashPaidToll({ paymentMethod: 'Cash' })).toBe(true);
    expect(isCashPaidToll({ paymentMethod: 'cash' })).toBe(true);
    expect(isCashPaidToll({ paymentMethod: 'tag_balance', receiptUrl: 'r.jpg' })).toBe(true);
  });

  it('treats tag / fleet account as non-cash', () => {
    expect(isCashPaidToll({ paymentMethod: 'tag_balance' })).toBe(false);
    expect(isCashPaidToll({ paymentMethod: 'Tag Balance' })).toBe(false);
    expect(isCashPaidToll({ paymentMethod: 'fleet_account' })).toBe(false);
    expect(isCashPaidToll({ paymentMethod: 'Fleet Account' })).toBe(false);
  });
});

describe('addToTollDisposition — accumulation', () => {
  it('sums |amount| into the correct buckets', () => {
    const d = emptyTollDisposition();
    addToTollDisposition(d, { paymentMethod: 'cash', amount: -10 });          // cashWash 10
    addToTollDisposition(d, { paymentMethod: 'tag_balance', resolution: 'personal', amount: 25 }); // personal 25
    addToTollDisposition(d, { paymentMethod: 'tag_balance', resolution: 'business', amount: 5 });   // fleet 5
    addToTollDisposition(d, { paymentMethod: 'tag_balance', amount: 3 });     // unresolved 3
    expect(d).toEqual({ cashWash: 10, personal: 25, fleet: 5, unresolved: 3 });
  });
});
