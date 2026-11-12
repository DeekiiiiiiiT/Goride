import { describe, expect, it } from 'vitest';
import { periodKeyFor } from '../../../finance-core/src/periodKey.ts';
import cases from './weekRuleCases.json';

describe('week rule drift: periodKeyFor vs ledger.jamaica_week_start cases', () => {
  it.each(cases as Array<{ at: string; week: string }>)(
    'at $at → week $week',
    ({ at, week }) => {
      expect(periodKeyFor({ effectiveAt: at }, 'America/Jamaica')).toBe(week);
    },
  );
});
