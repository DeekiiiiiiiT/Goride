import { describe, expect, it } from 'vitest';
import { blockerGroups } from './tollV2DeskLogic';

describe('blockerGroups', () => {
  it('counts an unchecked cash receipt (seal_blockers: kind charge, reason unverified) as a receipt, not a toll', () => {
    const groups = blockerGroups([
      { kind: 'charge', id: 'a', amountMinor: 100, reason: 'pending' },
      { kind: 'charge', id: 'b', amountMinor: 100, reason: 'pending' },
      { kind: 'charge', id: 'c', amountMinor: 100, reason: 'unverified' },
    ]);
    expect(groups.map((g) => [g.label, g.sectionId])).toEqual([
      ['2 tolls to decide', 'toll-v2-section-suggested'],
      ['1 receipt to check', 'toll-v2-section-receipts'],
    ]);
  });
});
