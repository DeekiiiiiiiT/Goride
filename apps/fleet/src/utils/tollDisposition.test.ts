import { describe, it, expect } from 'vitest';
import { classifyTollLedgerEntry, addToTollDisposition, emptyTollDisposition } from './tollDisposition';

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
