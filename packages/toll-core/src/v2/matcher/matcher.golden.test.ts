import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { uber } from '../adapters/uber.ts';
import { matchTolls, scorePair } from './engine.ts';
import type { Candidate, MatchBundle, MatchCharge, MatchPayback, MatchTrip } from './types.ts';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '../adapters/__fixtures__');

const charge = (o: Partial<MatchCharge> = {}): MatchCharge => ({
  id: 'c1',
  source: 'tag_statement',
  vehicle_id: 'v1',
  driver_id: 'd1',
  plaza_id: 'portmore',
  occurred_at: '2026-11-10T14:20:00-05:00',
  time_precision: 'minute',
  amount_minor: 34000,
  remaining_minor: 34000,
  evidence_status: 'verified',
  duplicate_of: null,
  after_seal: false,
  is_legacy: false,
  week_sealed: false,
  ...o,
});
const trip = (o: Partial<MatchTrip> = {}): MatchTrip => ({
  platform: 'uber',
  platform_trip_id: 't1',
  vehicle_id: 'v1',
  driver_id: 'd1',
  request_at: '2026-11-10T14:00:00-05:00',
  pickup_at: null,
  dropoff_at: '2026-11-10T14:50:00-05:00',
  time_precision: 'minute',
  payment_method: 'card',
  is_legacy: false,
  ...o,
});
const payback = (o: Partial<MatchPayback> = {}): MatchPayback => ({
  id: 'p1',
  platform: 'uber',
  kind: 'trip_line',
  platform_trip_id: 't1',
  driver_id: 'd1',
  paid_on: '2026-11-10',
  amount_minor: 34000,
  remaining_minor: 34000,
  received_by: 'fleet',
  reversal_of: null,
  reversed: false,
  after_seal: false,
  is_legacy: false,
  week_sealed: false,
  ...o,
});
const bundle = (o: Partial<MatchBundle> = {}): MatchBundle => ({
  focal: { charge_ids: ['c1'], payback_ids: [] },
  charges: [charge()],
  paybacks: [payback()],
  trips: [trip()],
  settings: [{ platform: 'uber', auto_apply: false, payback_mode: 'per_trip' }],
  ...o,
});

const autoOn = [{ platform: 'uber', auto_apply: true, payback_mode: 'per_trip' }];

function assertCandidate(c: Candidate) {
  const again = scorePair(JSON.parse(JSON.stringify(c.inputs)));
  expect(again.score).toBe(c.score);
  expect(again.rules_fired).toEqual(c.rules_fired);
  expect(again.score_parts).toEqual(c.score_parts);
}

function candidateAt(iso: string, b: Partial<MatchBundle> = {}) {
  return matchTolls(bundle({ charges: [charge({ occurred_at: iso })], ...b })).candidates[0];
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

describe('matcher golden', () => {
  it('matcher_golden_minute_enroute_start_outside', () => {
    expect(matchTolls(bundle({ charges: [charge({ occurred_at: '2026-11-10T13:13:59-05:00' })] })).candidates).toHaveLength(0);
  });

  it('matcher_golden_minute_enroute_start_inside', () => {
    const c = candidateAt('2026-11-10T13:14:00-05:00');
    expect(c.score).toBe(75);
    expect(c.rules_fired).toEqual(['enroute', 'amount_exact', 'sole_candidate', 'auto_apply_off']);
    assertCandidate(c);
  });

  it('matcher_golden_minute_trip_start_enroute_last', () => {
    const c = candidateAt('2026-11-10T13:58:59-05:00');
    expect(c.score_parts.window_hit).toBe('enroute');
    expect(c.score_parts.minutes_outside_trip).toBe(1);
    assertCandidate(c);
  });

  it('matcher_golden_minute_trip_start_on_trip_first', () => {
    const c = candidateAt('2026-11-10T13:59:00-05:00');
    expect(c.score).toBe(100);
    expect(c.rules_fired[0]).toBe('on_trip');
    assertCandidate(c);
  });

  it('matcher_golden_minute_post_trip_end_inside', () => {
    const c = candidateAt('2026-11-10T15:06:00-05:00');
    expect(c.score).toBe(65);
    expect(c.rules_fired).toEqual(['post_trip', 'amount_exact', 'sole_candidate', 'auto_apply_off']);
    assertCandidate(c);
  });

  it('matcher_golden_minute_post_trip_end_outside', () => {
    expect(matchTolls(bundle({ charges: [charge({ occurred_at: '2026-11-10T15:06:01-05:00' })] })).candidates).toHaveLength(0);
  });

  it('matcher_golden_exact_enroute_start_outside', () => {
    expect(
      matchTolls(
        bundle({
          charges: [charge({ occurred_at: '2026-11-10T13:14:59-05:00', time_precision: 'exact' })],
          trips: [trip({ time_precision: 'exact' })],
        }),
      ).candidates,
    ).toHaveLength(0);
  });

  it('matcher_golden_exact_enroute_start_inside', () => {
    const c = matchTolls(
      bundle({
        charges: [charge({ occurred_at: '2026-11-10T13:15:00-05:00', time_precision: 'exact' })],
        trips: [trip({ time_precision: 'exact' })],
      }),
    ).candidates[0];
    expect(c.rules_fired[0]).toBe('enroute');
    assertCandidate(c);
  });

  it('matcher_golden_exact_trip_start_on_trip', () => {
    const c = matchTolls(
      bundle({
        charges: [charge({ occurred_at: '2026-11-10T14:00:00-05:00', time_precision: 'exact' })],
        trips: [trip({ time_precision: 'exact' })],
      }),
    ).candidates[0];
    expect(c.rules_fired[0]).toBe('on_trip');
    assertCandidate(c);
  });

  it('matcher_golden_exact_post_trip_end_inside', () => {
    const c = matchTolls(
      bundle({
        charges: [charge({ occurred_at: '2026-11-10T15:05:00-05:00', time_precision: 'exact' })],
        trips: [trip({ time_precision: 'exact' })],
      }),
    ).candidates[0];
    expect(c.rules_fired[0]).toBe('post_trip');
    assertCandidate(c);
  });

  it('matcher_golden_exact_post_trip_end_outside', () => {
    expect(
      matchTolls(
        bundle({
          charges: [charge({ occurred_at: '2026-11-10T15:05:01-05:00', time_precision: 'exact' })],
          trips: [trip({ time_precision: 'exact' })],
        }),
      ).candidates,
    ).toHaveLength(0);
  });

  it('matcher_golden_pickup_splits_enroute', () => {
    const c = matchTolls(
      bundle({
        charges: [charge({ occurred_at: '2026-11-10T14:05:00-05:00' })],
        trips: [trip({ pickup_at: '2026-11-10T14:10:00-05:00' })],
      }),
    ).candidates[0];
    expect(c.rules_fired[0]).toBe('enroute');
    assertCandidate(c);
  });

  it('matcher_golden_no_dropoff_blocks_auto', () => {
    const c = matchTolls(
      bundle({
        charges: [charge({ occurred_at: '2026-11-10T14:00:00-05:00' })],
        trips: [trip({ dropoff_at: null })],
        settings: autoOn,
      }),
    ).candidates[0];
    expect(c.rules_fired).toContain('no_dropoff');
    expect(c.rules_fired).toContain('auto_apply_blocked');
    expect(c.auto_apply).toBe(false);
    assertCandidate(c);
  });

  it('matcher_golden_date_only_same_day_no_auto', () => {
    const c = matchTolls(
      bundle({
        charges: [charge({ time_precision: 'date_only', occurred_at: '2026-11-10T12:00:00-05:00' })],
        settings: autoOn,
      }),
    ).candidates[0];
    expect(c.rules_fired).toEqual([
      'same_day',
      'amount_exact',
      'sole_candidate',
      'date_only',
      'auto_apply_blocked',
    ]);
    assertCandidate(c);
  });

  it('matcher_golden_date_only_prior_day_not_candidate', () => {
    expect(
      matchTolls(
        bundle({
          charges: [charge({ time_precision: 'date_only', occurred_at: '2026-11-09T12:00:00-05:00' })],
        }),
      ).candidates,
    ).toHaveLength(0);
  });

  it('matcher_golden_amount_exact_on_remaining', () => {
    const c = matchTolls(
      bundle({
        charges: [charge({ amount_minor: 40000, remaining_minor: 34000 })],
        paybacks: [payback({ amount_minor: 50000, remaining_minor: 34000 })],
      }),
    ).candidates[0];
    expect(c.rules_fired).toContain('amount_exact');
    assertCandidate(c);
  });

  it('matcher_golden_amount_close_5pct', () => {
    const c = matchTolls(
      bundle({
        charges: [charge({ remaining_minor: 34000 })],
        paybacks: [payback({ remaining_minor: 32300 })],
      }),
    ).candidates[0];
    expect(c.rules_fired).toContain('amount_close');
    expect(c.score).toBe(85);
    assertCandidate(c);
  });

  it('matcher_golden_amount_payback_smaller', () => {
    const c = matchTolls(
      bundle({
        charges: [charge({ remaining_minor: 34000 })],
        paybacks: [payback({ remaining_minor: 32299 })],
      }),
    ).candidates[0];
    expect(c.rules_fired).toContain('payback_smaller');
    expect(c.score).toBe(70);
    assertCandidate(c);
  });

  it('matcher_golden_amount_payback_larger', () => {
    const c = matchTolls(
      bundle({
        charges: [charge({ remaining_minor: 34000 })],
        paybacks: [payback({ remaining_minor: 35701 })],
      }),
    ).candidates[0];
    expect(c.rules_fired).toContain('payback_larger');
    assertCandidate(c);
  });

  it('matcher_golden_compete_two_charges_one_payback', () => {
    const r = matchTolls(
      bundle({
        focal: { charge_ids: ['c1', 'c2'], payback_ids: [] },
        charges: [charge(), charge({ id: 'c2', occurred_at: '2026-11-10T14:35:00-05:00' })],
        settings: autoOn,
      }),
    );
    expect(r.candidates).toHaveLength(2);
    for (const c of r.candidates) {
      expect(c.rules_fired).toContain('competing_candidates');
      expect(c.auto_apply).toBe(false);
      assertCandidate(c);
    }
  });

  it('matcher_golden_compete_one_charge_two_trips', () => {
    const r = matchTolls(
      bundle({
        focal: { charge_ids: ['c1'], payback_ids: [] },
        charges: [charge({ occurred_at: '2026-11-10T15:03:00-05:00' })],
        paybacks: [
          payback({ id: 'p1', platform_trip_id: 't1' }),
          payback({ id: 'p2', platform_trip_id: 't2', paid_on: '2026-11-10' }),
        ],
        trips: [
          trip(),
          trip({
            platform_trip_id: 't2',
            request_at: '2026-11-10T15:00:00-05:00',
            dropoff_at: '2026-11-10T15:40:00-05:00',
          }),
        ],
        settings: autoOn,
      }),
    );
    expect(r.candidates).toHaveLength(2);
    expect(r.candidates.every((c) => c.rules_fired.includes('competing_candidates'))).toBe(true);
    r.candidates.forEach(assertCandidate);
  });

  it('matcher_golden_compete_tag_pair_shape', () => {
    const r = matchTolls(
      bundle({
        focal: { charge_ids: ['c1', 'c2'], payback_ids: [] },
        charges: [
          charge({ id: 'c1', occurred_at: '2026-11-10T14:20:00-05:00' }),
          charge({ id: 'c2', occurred_at: '2026-11-10T14:21:00-05:00', plaza_id: 'portmore' }),
        ],
        settings: autoOn,
      }),
    );
    expect(r.candidates).toHaveLength(2);
    r.candidates.forEach((c) => {
      expect(c.rules_fired).toContain('competing_candidates');
      expect(c.auto_apply).toBe(false);
      assertCandidate(c);
    });
  });

  it('matcher_golden_auto_apply_off', () => {
    const c = matchTolls(bundle()).candidates[0];
    expect(c.rules_fired).toContain('auto_apply_off');
    assertCandidate(c);
  });

  it('matcher_golden_auto_apply_blocked_not_sole', () => {
    const c = matchTolls(
      bundle({
        focal: { charge_ids: ['c1', 'c2'], payback_ids: [] },
        charges: [charge(), charge({ id: 'c2', occurred_at: '2026-11-10T14:35:00-05:00' })],
        settings: autoOn,
      }),
    ).candidates[0];
    expect(c.rules_fired).toContain('auto_apply_blocked');
    assertCandidate(c);
  });

  it('matcher_golden_auto_apply_blocked_enroute', () => {
    const c = matchTolls(
      bundle({
        charges: [charge({ occurred_at: '2026-11-10T13:20:00-05:00' })],
        settings: autoOn,
      }),
    ).candidates[0];
    expect(c.rules_fired).toContain('auto_apply_blocked');
    assertCandidate(c);
  });

  it('matcher_golden_auto_apply_blocked_low_score', () => {
    const c = matchTolls(
      bundle({
        charges: [charge({ occurred_at: '2026-11-10T13:20:00-05:00', remaining_minor: 34000 })],
        paybacks: [payback({ remaining_minor: 30000 })],
        settings: autoOn,
      }),
    ).candidates[0];
    expect(c.score).toBeLessThan(90);
    expect(c.rules_fired).toContain('auto_apply_blocked');
    assertCandidate(c);
  });

  it('matcher_golden_auto_apply_blocked_date_only', () => {
    const c = matchTolls(
      bundle({
        charges: [charge({ time_precision: 'date_only' })],
        settings: autoOn,
      }),
    ).candidates[0];
    expect(c.rules_fired).toContain('auto_apply_blocked');
    assertCandidate(c);
  });

  it('matcher_golden_auto_apply_blocked_receipt_unverified', () => {
    const c = matchTolls(
      bundle({
        charges: [charge({ source: 'driver_cash', evidence_status: 'unverified' })],
        settings: autoOn,
      }),
    ).candidates[0];
    expect(c.rules_fired).toContain('receipt_unverified');
    expect(c.rules_fired).toContain('auto_apply_blocked');
    assertCandidate(c);
  });

  it('matcher_golden_adjustment_same_day', () => {
    const c = matchTolls(
      bundle({
        paybacks: [payback({ kind: 'adjustment', platform_trip_id: null })],
        trips: [],
      }),
    ).candidates[0];
    expect(c.rules_fired[0]).toBe('adjustment_same_day');
    assertCandidate(c);
  });

  it('matcher_golden_adjustment_day_7', () => {
    const c = matchTolls(
      bundle({
        charges: [charge({ occurred_at: '2026-11-03T10:00:00-05:00' })],
        paybacks: [payback({ kind: 'adjustment', platform_trip_id: null, paid_on: '2026-11-10' })],
        trips: [],
      }),
    ).candidates[0];
    expect(c.rules_fired[0]).toBe('adjustment_within_lookback');
    assertCandidate(c);
  });

  it('matcher_golden_adjustment_day_8_out', () => {
    expect(
      matchTolls(
        bundle({
          charges: [charge({ occurred_at: '2026-11-02T10:00:00-05:00' })],
          paybacks: [payback({ kind: 'adjustment', platform_trip_id: null, paid_on: '2026-11-10' })],
          trips: [],
        }),
      ).candidates,
    ).toHaveLength(0);
  });

  it('matcher_golden_adjustment_wrong_driver', () => {
    expect(
      matchTolls(
        bundle({
          charges: [charge({ driver_id: 'd2' })],
          paybacks: [payback({ kind: 'adjustment', platform_trip_id: null, driver_id: 'd1' })],
          trips: [],
        }),
      ).candidates,
    ).toHaveLength(0);
  });

  it('matcher_golden_trip_line_not_by_driver_alone', () => {
    expect(
      matchTolls(
        bundle({
          charges: [charge({ vehicle_id: 'v2', driver_id: 'd1' })],
          paybacks: [payback({ kind: 'trip_line' })],
          trips: [trip()],
        }),
      ).candidates,
    ).toHaveLength(0);
  });

  const chargeExclusionCases: Array<[string, Partial<MatchCharge>, string]> = [
    ['roam_native', { source: 'roam_ride' }, 'roam_native'],
    ['legacy', { is_legacy: true }, 'legacy'],
    ['duplicate', { duplicate_of: 'c0' }, 'duplicate'],
    ['after_seal', { after_seal: true }, 'after_seal'],
    ['week_sealed', { week_sealed: true }, 'week_sealed'],
    ['receipt_rejected', { evidence_status: 'rejected' }, 'receipt_rejected'],
    ['fully_decided', { remaining_minor: 0 }, 'fully_decided'],
  ];

  for (const [name, patch, reason] of chargeExclusionCases) {
    it(`matcher_golden_exclusion_charge_${name}`, () => {
      const r = matchTolls(bundle({ charges: [charge(patch)] }));
      expect(r.candidates).toHaveLength(0);
      expect(r.excluded.charges).toEqual([{ id: 'c1', reason }]);
    });
  }

  const paybackExclusionCases: Array<[string, Partial<MatchPayback>, string, Partial<MatchBundle>?]> = [
    ['reversing_payback', { reversal_of: 'p0' }, 'reversing_payback', undefined],
    ['reversed', { reversed: true }, 'reversed', undefined],
    ['trip_missing', { platform_trip_id: 'missing' }, 'trip_missing', { trips: [] }],
    ['roam_native', { kind: 'native' }, 'roam_native', { trips: [] }],
    ['legacy', { is_legacy: true }, 'legacy', undefined],
    ['fully_decided', { remaining_minor: 0 }, 'fully_decided', undefined],
  ];

  for (const [name, patch, reason, extra] of paybackExclusionCases) {
    it(`matcher_golden_exclusion_payback_${name}`, () => {
      const r = matchTolls(
        bundle({
          focal: { charge_ids: [], payback_ids: ['p1'] },
          charges: [],
          paybacks: [payback(patch)],
          trips: extra?.trips ?? [trip()],
          ...extra,
        }),
      );
      expect(r.candidates).toHaveLength(0);
      expect(r.excluded.paybacks).toEqual([{ id: 'p1', reason }]);
    });
  }

  it('matcher_golden_determinism_shuffled_arrays', () => {
    const base = bundle({
      focal: { charge_ids: ['c1', 'c2'], payback_ids: [] },
      charges: [charge(), charge({ id: 'c2', occurred_at: '2026-11-10T14:35:00-05:00' })],
    });
    const expected = matchTolls(base);
    const shuffled = matchTolls({
      ...base,
      charges: shuffle(base.charges),
      paybacks: shuffle(base.paybacks),
      trips: shuffle(base.trips),
    });
    expect(shuffled).toEqual(expected);
  });

  it('matcher_golden_uber_fixture_on_trip', () => {
    const uberOut = uber(
      {
        payments: readFileSync(join(FIXTURES, 'payments_transaction_golden.csv'), 'utf8'),
        tripActivity: readFileSync(join(FIXTURES, 'trip_activity_golden.csv'), 'utf8'),
      },
      {
        driverByUberUuid: { '52ff47da-ef48-41b8-93d5-80a09b85ce5b': 'driver-kenny' },
        vehicleByPlate: { '5179KZ': 'vehicle-5179' },
      },
    );
    const uberTrip = uberOut.rows.find(
      (r) => r.row_type === 'trip' && r.platform_trip_id === '789d19f5-4ef6-4f08-88de-b330f424c989',
    );
    if (!uberTrip || uberTrip.row_type !== 'trip') throw new Error('missing uber trip');

    const b: MatchBundle = {
      focal: { charge_ids: ['tag-1'], payback_ids: [] },
      charges: [
        {
          id: 'tag-1',
          source: 'tag_statement',
          vehicle_id: uberTrip.vehicle_id,
          driver_id: uberTrip.driver_id,
          plaza_id: 'main',
          occurred_at: '2026-01-12T06:30:00-05:00',
          time_precision: 'minute',
          amount_minor: 37000,
          remaining_minor: 37000,
          evidence_status: 'verified',
          duplicate_of: null,
          after_seal: false,
          is_legacy: false,
          week_sealed: false,
        },
      ],
      paybacks: [
        {
          id: 'pb-1',
          platform: 'uber',
          kind: 'trip_line',
          platform_trip_id: uberTrip.platform_trip_id,
          driver_id: uberTrip.driver_id,
          paid_on: '2026-01-12',
          amount_minor: 37000,
          remaining_minor: 37000,
          received_by: 'driver',
          reversal_of: null,
          reversed: false,
          after_seal: false,
          is_legacy: false,
          week_sealed: false,
        },
      ],
      trips: [
        {
          platform: 'uber',
          platform_trip_id: uberTrip.platform_trip_id,
          vehicle_id: uberTrip.vehicle_id,
          driver_id: uberTrip.driver_id,
          request_at: uberTrip.request_at,
          pickup_at: null,
          dropoff_at: uberTrip.dropoff_at ?? null,
          time_precision: 'minute',
          payment_method: uberTrip.payment_method,
          is_legacy: false,
        },
      ],
      settings: [{ platform: 'uber', auto_apply: false, payback_mode: 'per_trip' }],
    };

    const c = matchTolls(b).candidates[0];
    expect(c.score).toBe(100);
    expect(c.rules_fired).toEqual(['on_trip', 'amount_exact', 'sole_candidate', 'auto_apply_off']);
    assertCandidate(c);
  });
});
