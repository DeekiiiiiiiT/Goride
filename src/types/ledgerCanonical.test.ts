import { describe, expect, it } from 'vitest';
import { CANONICAL_LEDGER_EVENT_TYPES, CANONICAL_LEDGER_SCHEMA_VERSION } from './ledgerCanonical';

describe('ledgerCanonical types', () => {
  it('schema version is 1', () => {
    expect(CANONICAL_LEDGER_SCHEMA_VERSION).toBe(1);
  });

  it('includes SSOT-oriented event types for Phase 4+', () => {
    expect(CANONICAL_LEDGER_EVENT_TYPES).toContain('statement_line');
    expect(CANONICAL_LEDGER_EVENT_TYPES).toContain('payout_bank');
    expect(CANONICAL_LEDGER_EVENT_TYPES).toContain('fare_earning');
  });
});
