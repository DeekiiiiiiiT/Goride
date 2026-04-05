import { describe, it, expect } from 'vitest';
import { CANONICAL_LEDGER_KEY_LIKE, resolveLedgerApiSourceParam } from './ledgerKvSource';

describe('ledgerKvSource', () => {
  it('exposes canonical KV prefix', () => {
    expect(CANONICAL_LEDGER_KEY_LIKE).toBe('ledger_event:%');
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
