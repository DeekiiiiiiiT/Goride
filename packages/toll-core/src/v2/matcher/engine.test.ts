import { describe, expect, it } from 'vitest';
import { ENGINE_VERSION, matchTolls, scorePair } from './engine.ts';
import type { MatchBundle, MatchCharge, MatchPayback, MatchTrip } from './types.ts';

// Claude's smoke cases for P2-R3. Cursor's golden suite (matcher_golden_*) adds the full set.

const charge = (o: Partial<MatchCharge> = {}): MatchCharge => ({
  id: 'c1', source: 'tag_statement', vehicle_id: 'v1', driver_id: 'd1', plaza_id: 'portmore',
  occurred_at: '2026-11-10T14:20:00-05:00', time_precision: 'minute', amount_minor: 34000,
  remaining_minor: 34000, evidence_status: 'verified', duplicate_of: null, after_seal: false,
  is_legacy: false, week_sealed: false, ...o,
});
const trip = (o: Partial<MatchTrip> = {}): MatchTrip => ({
  platform: 'uber', platform_trip_id: 't1', vehicle_id: 'v1', driver_id: 'd1',
  request_at: '2026-11-10T14:00:00-05:00', pickup_at: null, dropoff_at: '2026-11-10T14:50:00-05:00',
  time_precision: 'minute', payment_method: 'card', is_legacy: false, ...o,
});
const payback = (o: Partial<MatchPayback> = {}): MatchPayback => ({
  id: 'p1', platform: 'uber', kind: 'trip_line', platform_trip_id: 't1', driver_id: 'd1',
  paid_on: '2026-11-10', amount_minor: 34000, remaining_minor: 34000, received_by: 'fleet',
  reversal_of: null, reversed: false, after_seal: false, is_legacy: false, week_sealed: false, ...o,
});
const bundle = (o: Partial<MatchBundle> = {}): MatchBundle => ({
  focal: { charge_ids: ['c1'], payback_ids: [] },
  charges: [charge()], paybacks: [payback()], trips: [trip()],
  settings: [{ platform: 'uber', auto_apply: false, payback_mode: 'per_trip' }], ...o,
});

describe('toll matcher v1 (smoke)', () => {
  it('on-trip, exact amount, sole candidate → 100, shadow (auto_apply off)', () => {
    const r = matchTolls(bundle());
    expect(r.engine_version).toBe(ENGINE_VERSION);
    expect(r.candidates).toHaveLength(1);
    const c = r.candidates[0];
    expect(c.score).toBe(100);
    expect(c.rules_fired).toEqual(['on_trip', 'amount_exact', 'sole_candidate', 'auto_apply_off']);
    expect(c.auto_apply).toBe(false);
  });

  it('auto-apply only when the platform has it on', () => {
    const r = matchTolls(bundle({ settings: [{ platform: 'uber', auto_apply: true, payback_mode: 'per_trip' }] }));
    expect(r.candidates[0].auto_apply).toBe(true);
    expect(r.candidates[0].rules_fired).toContain('auto_apply_eligible');
  });

  it('stored inputs re-score to the same answer (I11)', () => {
    const c = matchTolls(bundle()).candidates[0];
    const again = scorePair(JSON.parse(JSON.stringify(c.inputs)));
    expect(again.score).toBe(c.score);
    expect(again.rules_fired).toEqual(c.rules_fired);
    expect(again.score_parts).toEqual(c.score_parts);
  });

  it('enroute (40 min before request) and post-trip (10 min after drop-off)', () => {
    const en = matchTolls(bundle({ charges: [charge({ occurred_at: '2026-11-10T13:20:00-05:00' })] })).candidates[0];
    expect(en.score_parts.window_hit).toBe('enroute');
    expect(en.score_parts.minutes_outside_trip).toBe(40);
    const post = matchTolls(bundle({ charges: [charge({ occurred_at: '2026-11-10T15:00:00-05:00' })] })).candidates[0];
    expect(post.score_parts.window_hit).toBe('post_trip');
  });

  it('outside −45/+15 is not a candidate; minute precision widens by 60 s only', () => {
    expect(matchTolls(bundle({ charges: [charge({ occurred_at: '2026-11-10T13:13:59-05:00' })] })).candidates).toHaveLength(0);
    expect(matchTolls(bundle({ charges: [charge({ occurred_at: '2026-11-10T13:14:00-05:00' })] })).candidates).toHaveLength(1);
    expect(matchTolls(bundle({ charges: [charge({ occurred_at: '2026-11-10T15:06:00-05:00' })] })).candidates).toHaveLength(1);
    expect(matchTolls(bundle({ charges: [charge({ occurred_at: '2026-11-10T15:06:01-05:00' })] })).candidates).toHaveLength(0);
  });

  it('a different vehicle never matches', () => {
    expect(matchTolls(bundle({ charges: [charge({ vehicle_id: 'v2' })] })).candidates).toHaveLength(0);
  });

  it('two crossings on one trip compete; neither can auto-apply', () => {
    const r = matchTolls(bundle({
      focal: { charge_ids: ['c1', 'c2'], payback_ids: [] },
      charges: [charge(), charge({ id: 'c2', occurred_at: '2026-11-10T14:35:00-05:00' })],
      settings: [{ platform: 'uber', auto_apply: true, payback_mode: 'per_trip' }],
    }));
    expect(r.candidates).toHaveLength(2);
    for (const c of r.candidates) {
      expect(c.rules_fired).toContain('competing_candidates');
      expect(c.auto_apply).toBe(false);
    }
  });

  it('date_only never auto-applies', () => {
    const r = matchTolls(bundle({
      charges: [charge({ time_precision: 'date_only', occurred_at: '2026-11-10T12:00:00-05:00' })],
      settings: [{ platform: 'uber', auto_apply: true, payback_mode: 'per_trip' }],
    }));
    expect(r.candidates[0].score_parts.window_hit).toBe('same_day');
    expect(r.candidates[0].auto_apply).toBe(false);
  });

  it('support adjustment: same driver within 7 days, no trip, never auto', () => {
    const adj = payback({ id: 'p2', kind: 'adjustment', platform_trip_id: null, paid_on: '2026-11-14' });
    const r = matchTolls(bundle({ paybacks: [adj], trips: [], settings: [{ platform: 'uber', auto_apply: true, payback_mode: 'per_trip' }] }));
    expect(r.candidates).toHaveLength(1);
    expect(r.candidates[0].rules_fired).toEqual(
      ['adjustment_within_lookback', 'amount_exact', 'sole_candidate', 'no_trip', 'auto_apply_blocked']);
    const late = payback({ id: 'p2', kind: 'adjustment', platform_trip_id: null, paid_on: '2026-11-18' });
    expect(matchTolls(bundle({ paybacks: [late], trips: [] })).candidates).toHaveLength(0);
  });

  it('exclusions are reported for focal records', () => {
    const r = matchTolls(bundle({
      focal: { charge_ids: ['c1'], payback_ids: ['p1'] },
      charges: [charge({ duplicate_of: 'c0' })],
      paybacks: [payback({ reversed: true })],
    }));
    expect(r.candidates).toHaveLength(0);
    expect(r.excluded.charges).toEqual([{ id: 'c1', reason: 'duplicate' }]);
    expect(r.excluded.paybacks).toEqual([{ id: 'p1', reason: 'reversed' }]);
  });

  it('unverified cash receipt is suggested but never auto-applied', () => {
    const r = matchTolls(bundle({
      charges: [charge({ source: 'driver_cash', evidence_status: 'unverified' })],
      settings: [{ platform: 'uber', auto_apply: true, payback_mode: 'per_trip' }],
    }));
    expect(r.candidates[0].rules_fired).toContain('receipt_unverified');
    expect(r.candidates[0].auto_apply).toBe(false);
  });

  it('pairs not touching a focal record are not returned', () => {
    expect(matchTolls(bundle({ focal: { charge_ids: [], payback_ids: [] } })).candidates).toHaveLength(0);
  });
});
