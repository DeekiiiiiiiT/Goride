import { describe, it, expect } from 'vitest';
import {
  dateBelongsToWeek,
  scopeTollReadinessWeekInputs,
} from './tollPeriodReadinessScope.ts';

const TZ = 'America/Jamaica';
/** Mon Oct 12 – Sun Oct 18 2026 */
const WEEK = '2026-10-12';

describe('tollPeriodReadinessScope', () => {
  it('dateBelongsToWeek: Mon–Sun inclusive, prior Sunday excluded', () => {
    expect(dateBelongsToWeek('2026-10-12', WEEK, TZ)).toBe(true);
    expect(dateBelongsToWeek('2026-10-18', WEEK, TZ)).toBe(true);
    expect(dateBelongsToWeek('2026-10-11', WEEK, TZ)).toBe(false);
    expect(dateBelongsToWeek('2026-10-19', WEEK, TZ)).toBe(false);
  });

  it('excludes prior-week unmatched dispute (Kenny $70 Oct 11 shape)', () => {
    const scoped = scopeTollReadinessWeekInputs({
      weekKey: WEEK,
      fleetTz: TZ,
      tollTx: [{ id: 't1', date: '2026-10-15' }],
      trips: [{ id: 'trip1', date: '2026-10-15' }],
      disputeRefunds: [
        {
          date: '2026-10-11T23:55:31.524Z',
          matchedClaimId: null,
          matchedTollId: null,
        },
      ],
    });
    expect(scoped.weekDisputes).toHaveLength(0);
  });

  it('keeps unmatched dispute dated inside the week', () => {
    const scoped = scopeTollReadinessWeekInputs({
      weekKey: WEEK,
      fleetTz: TZ,
      tollTx: [],
      trips: [],
      disputeRefunds: [
        {
          date: '2026-10-14T12:00:00.000Z',
          matchedClaimId: null,
          matchedTollId: null,
        },
      ],
    });
    expect(scoped.weekDisputes).toHaveLength(1);
  });

  it('drops pad-window trips (Oct 10) from weekTrips used for unlinked counts', () => {
    const scoped = scopeTollReadinessWeekInputs({
      weekKey: WEEK,
      fleetTz: TZ,
      tollTx: [
        { id: 'toll-oct10', date: '2026-10-10' },
        { id: 'toll-oct15', date: '2026-10-15' },
      ],
      trips: [
        { id: 'pad-trip', date: '2026-10-10' },
        { id: 'week-trip', date: '2026-10-15' },
      ],
      disputeRefunds: [],
    });
    expect(scoped.weekTrips.map((t) => t.id)).toEqual(['week-trip']);
    expect(scoped.weekTolls.map((t) => t.id)).toEqual(['toll-oct15']);
  });

  it('scopes claims by toll date when transactionId anchors into the week', () => {
    const scoped = scopeTollReadinessWeekInputs({
      weekKey: WEEK,
      fleetTz: TZ,
      tollTx: [{ id: 'toll-a', date: '2026-10-15' }],
      trips: [],
      disputeRefunds: [],
      claims: [
        { id: 'c-in', type: 'Toll_Refund', transactionId: 'toll-a', date: '2026-09-01' },
        { id: 'c-out', type: 'Toll_Refund', date: '2026-10-05' },
        { id: 'c-other', type: 'Fuel', date: '2026-10-15' },
      ],
    });
    expect(scoped.weekClaims.map((c) => c.id)).toEqual(['c-in']);
  });
});
