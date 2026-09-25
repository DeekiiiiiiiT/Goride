import { describe, expect, it } from 'vitest';
import {
  WEEK_SEALED_MATCH_CODE,
  countSealedMatchRefusals,
  datesAndOrgForMatchPair,
} from './jaaMatchSeal';

describe('jaaMatchSeal', () => {
  it('datesAndOrgForMatchPair uses statement/driver dates and org fallback', () => {
    expect(
      datesAndOrgForMatchPair(
        {
          statementEntry: { date: '2026-08-05T20:24:00Z', organizationId: 'org-a' },
          driverEntry: { date: '2026-08-06' },
        },
        'org-fallback',
      ),
    ).toEqual({ orgId: 'org-a', datesYmd: ['2026-08-05', '2026-08-06'] });

    expect(
      datesAndOrgForMatchPair(
        {
          statementEntry: { date: '2026-08-05' },
          driverEntry: { date: '2026-08-05' },
        },
        'org-fallback',
      ),
    ).toEqual({ orgId: 'org-fallback', datesYmd: ['2026-08-05'] });
  });

  it('countSealedMatchRefusals only counts week_sealed refusals', () => {
    expect(
      countSealedMatchRefusals([
        { ok: true },
        { ok: false, code: WEEK_SEALED_MATCH_CODE },
        { ok: false, code: 'other' },
        { ok: false, code: WEEK_SEALED_MATCH_CODE },
      ]),
    ).toBe(2);
  });
});
