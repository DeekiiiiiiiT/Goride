import { describe, it, expect } from 'vitest';
import {
  buildClaimByTollId,
  collectDuplicateClaimIds,
  dedupeClaimsForDisplay,
  pickCanonicalClaimForToll,
} from './claimByToll';
import type { Claim } from '../types/data';

const base = (overrides: Partial<Claim>): Claim =>
  ({
    id: 'c1',
    driverId: 'd1',
    type: 'Toll_Refund',
    status: 'Open',
    amount: 10,
    transactionId: 'toll-1',
    createdAt: '2026-07-01T10:00:00Z',
    updatedAt: '2026-07-01T10:00:00Z',
    ...overrides,
  }) as Claim;

describe('claimByToll', () => {
  it('prefers Sent_to_Driver over Open for same toll', () => {
    const claims = [
      base({ id: 'open', status: 'Open', updatedAt: '2026-07-08T19:00:00Z' }),
      base({ id: 'sent', status: 'Sent_to_Driver', updatedAt: '2026-07-08T18:00:00Z' }),
    ];
    expect(pickCanonicalClaimForToll(claims, 'toll-1')?.id).toBe('sent');
    expect(buildClaimByTollId(claims).get('toll-1')?.id).toBe('sent');
  });

  it('dedupes awaiting list to one row per toll', () => {
    const claims = [
      base({ id: 'a', status: 'Sent_to_Driver', updatedAt: '2026-07-08T18:49:00Z' }),
      base({ id: 'b', status: 'Sent_to_Driver', updatedAt: '2026-07-08T19:02:00Z' }),
    ];
    const { displayClaims, duplicateCount } = dedupeClaimsForDisplay(claims);
    expect(displayClaims).toHaveLength(1);
    expect(displayClaims[0].id).toBe('b');
    expect(duplicateCount).toBe(1);
  });

  it('collects duplicate ids for pruning', () => {
    const claims = [
      base({ id: 'a', status: 'Sent_to_Driver', updatedAt: '2026-07-08T18:49:00Z' }),
      base({ id: 'b', status: 'Sent_to_Driver', updatedAt: '2026-07-08T19:02:00Z' }),
    ];
    expect(collectDuplicateClaimIds(claims)).toEqual(['a']);
  });
});
