import { describe, it, expect } from 'vitest';
import {
  ledgerKeyLikePrefix,
  resolveLedgerApiSourceParam,
  resolveTripLedgerGapSourceParam,
} from './ledgerKvSource';

describe('ledgerKvSource', () => {
  it('prefixes KV keys for canonical vs legacy', () => {
    expect(ledgerKeyLikePrefix('canonical')).toBe('ledger_event:%');
    expect(ledgerKeyLikePrefix('legacy')).toBe('ledger:%');
  });

  it('defaults to canonical', () => {
    expect(resolveLedgerApiSourceParam(undefined)).toBe('canonical');
    expect(resolveLedgerApiSourceParam(null)).toBe('canonical');
    expect(resolveLedgerApiSourceParam('')).toBe('canonical');
    expect(resolveLedgerApiSourceParam('canonical')).toBe('canonical');
    expect(resolveLedgerApiSourceParam('CANONICAL')).toBe('canonical');
  });

  it('maps legacy aliases', () => {
    expect(resolveLedgerApiSourceParam('legacy')).toBe('legacy');
    expect(resolveLedgerApiSourceParam('ledger')).toBe('legacy');
    expect(resolveLedgerApiSourceParam('ledger_legacy')).toBe('legacy');
  });
});

describe('resolveTripLedgerGapSourceParam', () => {
  it('defaults to canonical', () => {
    expect(resolveTripLedgerGapSourceParam(undefined)).toBe('canonical');
    expect(resolveTripLedgerGapSourceParam('')).toBe('canonical');
  });

  it('resolves legacy and both', () => {
    expect(resolveTripLedgerGapSourceParam('legacy')).toBe('legacy');
    expect(resolveTripLedgerGapSourceParam('both')).toBe('both');
    expect(resolveTripLedgerGapSourceParam('compare')).toBe('both');
    expect(resolveTripLedgerGapSourceParam('all')).toBe('both');
  });
});
