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

  it('ignores legacy aliases (always canonical)', () => {
    expect(resolveLedgerApiSourceParam('legacy')).toBe('canonical');
    expect(resolveLedgerApiSourceParam('ledger')).toBe('canonical');
    expect(resolveLedgerApiSourceParam('ledger_legacy')).toBe('canonical');
  });
});

describe('resolveTripLedgerGapSourceParam', () => {
  it('always canonical', () => {
    expect(resolveTripLedgerGapSourceParam(undefined)).toBe('canonical');
    expect(resolveTripLedgerGapSourceParam('')).toBe('canonical');
    expect(resolveTripLedgerGapSourceParam('legacy')).toBe('canonical');
    expect(resolveTripLedgerGapSourceParam('both')).toBe('canonical');
  });
});
