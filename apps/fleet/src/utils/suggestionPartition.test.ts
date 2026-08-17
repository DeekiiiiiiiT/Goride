import { describe, it, expect } from 'vitest';
import { partitionSuggestions, smartReadyBannerLabel, collectReadyToLinkPairs } from './suggestionPartition';
import { FinancialTransaction } from '../types/data';
import { MatchResult } from './tollReconciliation';

const toll = (id: string, over: Partial<FinancialTransaction> = {}): FinancialTransaction =>
  ({ id, date: '2026-07-10', amount: -100, ...over } as FinancialTransaction);

const match = (over: Partial<MatchResult>): MatchResult =>
  ({
    trip: { id: 't1' } as any,
    confidence: 'high',
    confidenceScore: 90,
    reason: '',
    matchType: 'PERSONAL_MATCH',
    ...over,
  } as MatchResult);

describe('partitionSuggestions', () => {
  it('puts orphans and personal matches in one suggestions rail on personal-use', () => {
    const orphanTx = toll('o1');
    const personalTx = toll('p1');
    const moneyTx = toll('m1');
    const map = new Map<string, MatchResult[]>([
      ['o1', [match({ matchType: 'PERSONAL_MATCH', reasonCode: 'ORPHAN_NO_TRIP', trip: { id: '' } as any })]],
      ['p1', [match({ matchType: 'PERSONAL_MATCH', reasonCode: 'POST_TRIP_GAP' })]],
      ['m1', [match({ matchType: 'PERFECT_MATCH', confidenceScore: 100 })]],
    ]);
    const { suggestions, other } = partitionSuggestions(
      [orphanTx, personalTx, moneyTx],
      map,
      'personal-use',
    );
    expect(suggestions.map((s) => s.toll.id).sort()).toEqual(['o1', 'p1']);
    expect(suggestions.find((s) => s.toll.id === 'o1')?.orphanMode).toBe(true);
    expect(other.map((t) => t.id)).toEqual(['m1']);
  });

  it('puts ambiguous before other kinds', () => {
    const a = toll('a');
    const b = toll('b');
    const map = new Map<string, MatchResult[]>([
      ['a', [match({ matchType: 'AMOUNT_VARIANCE', isAmbiguous: true })]],
      ['b', [match({ matchType: 'PERFECT_MATCH' })]],
    ]);
    const { suggestions } = partitionSuggestions([b, a], map, 'needs-review');
    expect(suggestions[0].kind).toBe('ambiguous');
    expect(suggestions[0].toll.id).toBe('a');
  });
});

describe('smartReadyBannerLabel', () => {
  it('is step-aware', () => {
    expect(smartReadyBannerLabel('personal-use')).toBe('Confirm personal');
    expect(smartReadyBannerLabel('deadhead')).toBe('Confirm deadhead');
    expect(smartReadyBannerLabel('needs-review')).toBe('Ready to link');
  });
});

describe('collectReadyToLinkPairs', () => {
  it('links money matches and skips ambiguous, personal, cash, and duplicate trips', () => {
    const moneyA = toll('m1');
    const moneyB = toll('m2');
    const sameTrip = toll('m3');
    const ambiguous = toll('a1');
    const personal = toll('p1');
    const cash = toll('c1', { paymentMethod: 'Cash' });
    const map = new Map<string, MatchResult[]>([
      ['m1', [match({ matchType: 'PERFECT_MATCH', trip: { id: 't1' } as any, confidence: 'medium', confidenceScore: 100 })]],
      ['m2', [match({ matchType: 'PERFECT_MATCH', trip: { id: 't2' } as any, confidenceScore: 90 })]],
      ['m3', [match({ matchType: 'PERFECT_MATCH', trip: { id: 't1' } as any })]],
      ['a1', [match({ matchType: 'AMOUNT_VARIANCE', isAmbiguous: true, trip: { id: 't9' } as any })]],
      ['p1', [match({ matchType: 'PERSONAL_MATCH', trip: { id: 't8' } as any })]],
      ['c1', [match({ matchType: 'PERFECT_MATCH', trip: { id: 't7' } as any })]],
    ]);
    const { suggestions: entries } = partitionSuggestions(
      [moneyA, moneyB, sameTrip, ambiguous, personal, cash],
      map,
      'needs-review',
    );
    expect(collectReadyToLinkPairs(entries, map)).toEqual([
      { transactionId: 'm1', tripId: 't1' },
      { transactionId: 'm2', tripId: 't2' },
    ]);
  });
});
