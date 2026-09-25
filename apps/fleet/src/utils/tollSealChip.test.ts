import { describe, expect, it } from 'vitest';
import { deriveTollSealChip } from './tollSealChip';

describe('deriveTollSealChip', () => {
  it('returns null when nothing stamped', () => {
    expect(deriveTollSealChip({})).toBeNull();
    expect(deriveTollSealChip({ periodState: 'open' })).toBeNull();
    expect(deriveTollSealChip({ periodState: 'reopened' })).toBeNull();
  });

  it('maps ready → Reviewed', () => {
    expect(deriveTollSealChip({ periodState: 'ready' })).toBe('reviewed');
  });

  it('maps sealed / closed statements → Sealed', () => {
    expect(deriveTollSealChip({ periodState: 'sealed' })).toBe('sealed');
    expect(deriveTollSealChip({ hasClosedTollStatement: true })).toBe('sealed');
    expect(deriveTollSealChip({ periodState: 'ready', hasClosedTollStatement: true })).toBe(
      'sealed',
    );
  });

  it('Closed wins over Sealed and Reviewed', () => {
    expect(
      deriveTollSealChip({
        weekClosed: true,
        periodState: 'ready',
        hasClosedTollStatement: true,
      }),
    ).toBe('closed');
  });
});
