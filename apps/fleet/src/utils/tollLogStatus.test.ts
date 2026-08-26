import { describe, it, expect } from 'vitest';
import { resolveTollStatusDisplay, excludeVoided } from './tollLogStatus';

describe('resolveTollStatusDisplay', () => {
  it('labels a soft-voided row as Voided even when it still reads Completed', () => {
    expect(
      resolveTollStatusDisplay({ status: 'Completed', metadata: { voided: true } }),
    ).toBe('Voided');
  });

  it('normalises the legacy Void status onto Voided', () => {
    expect(resolveTollStatusDisplay({ status: 'Void' })).toBe('Voided');
    expect(resolveTollStatusDisplay({ status: 'voided' })).toBe('Voided');
  });

  it('passes real statuses through untouched', () => {
    expect(resolveTollStatusDisplay({ status: 'Reconciled' })).toBe('Reconciled');
    expect(resolveTollStatusDisplay({ status: 'Flagged' })).toBe('Flagged');
  });

  it('falls back to Unknown for a missing status', () => {
    expect(resolveTollStatusDisplay({})).toBe('Unknown');
  });
});

describe('excludeVoided', () => {
  it('drops voided rows so they never reach a spend total', () => {
    const rows = [
      { id: 'a', isVoided: false, absAmount: 300 },
      { id: 'b', isVoided: true, absAmount: 9000 },
      { id: 'c', isVoided: false, absAmount: 200 },
    ];
    const kept = excludeVoided(rows);
    expect(kept.map((r) => r.id)).toEqual(['a', 'c']);
    expect(kept.reduce((s, r) => s + r.absAmount, 0)).toBe(500);
  });
});
