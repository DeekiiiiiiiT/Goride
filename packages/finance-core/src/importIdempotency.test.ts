import { describe, expect, it } from 'vitest';
import { importMoneyIdempotencyKey } from './importIdempotency.ts';

describe('importMoneyIdempotencyKey', () => {
  it('uses file hash when present so a new batch cannot mint a second copy', () => {
    expect(importMoneyIdempotencyKey('deadbeefcafe', 'batch-1', 'payout|cash|d1')).toBe(
      'file:deadbeefcafe|payout|cash|d1',
    );
    expect(importMoneyIdempotencyKey('deadbeefcafe', 'batch-2', 'payout|cash|d1')).toBe(
      'file:deadbeefcafe|payout|cash|d1',
    );
  });

  it('falls back to batch id when hash is missing', () => {
    expect(importMoneyIdempotencyKey(undefined, 'batch-1', 'payout|cash|d1')).toBe(
      'batch-1|payout|cash|d1',
    );
  });
});
